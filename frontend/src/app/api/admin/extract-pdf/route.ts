import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";

export async function POST(request: NextRequest) {
    try {
        const session = await getServerSession(authOptions);
        if (!session) {
            console.error("[AUTH ERROR] No session found in route");
            return new NextResponse("Unauthorized", { status: 401 });
        }

        const formData = await request.formData();
        const file = formData.get('file') as File;
        const folderId = formData.get('folderId') as string;
        const taxonomyIdsRaw = formData.get('taxonomyIds') as string;
        const taxonomyIds: string[] = taxonomyIdsRaw ? JSON.parse(taxonomyIdsRaw) : [];

        if (!file || (!folderId && taxonomyIds.length === 0)) {
            return NextResponse.json({ success: false, error: "Missing file or topic selection" }, { status: 400 });
        }

        if (!process.env.MATHPIX_APP_ID || !process.env.MATHPIX_APP_KEY) {
            return NextResponse.json({ error: "Mathpix credentials missing." }, { status: 500 });
        }

        // 1. Mathpix Async Extraction POST
        console.log(`[EXTRACT-PDF] Sending file ${file.name} to Mathpix Async API...`);
        
        const mathpixFormData = new FormData();
        mathpixFormData.append("file", file);
        mathpixFormData.append("options_json", JSON.stringify({
            math_inline_delimiters: ["$", "$"],
            math_display_delimiters: ["$$", "$$"],
            rm_spaces: true
        }));

        const mathpixRes = await fetch("https://api.mathpix.com/v3/pdf", {
            method: "POST",
            headers: {
                "app_id": process.env.MATHPIX_APP_ID,
                "app_key": process.env.MATHPIX_APP_KEY,
            },
            body: mathpixFormData as any
        });
        
        const mathpixData = await mathpixRes.json();
        if (mathpixData.error) throw new Error(mathpixData.error);
        if (!mathpixData.pdf_id) throw new Error("No pdf_id returned from Mathpix");

        const pdfId = mathpixData.pdf_id;
        console.log(`[EXTRACT-PDF] Mathpix Processing Started. Job ID: ${pdfId}`);

        // 2. Poll for Completion
        let isCompleted = false;
        let pollCount = 0;
        while (!isCompleted && pollCount < 60) {
            await new Promise(r => setTimeout(r, 3000));
            const statusRes = await fetch(`https://api.mathpix.com/v3/pdf/${pdfId}`, {
                headers: {
                    "app_id": process.env.MATHPIX_APP_ID!,
                    "app_key": process.env.MATHPIX_APP_KEY!
                }
            });
            const statusData = await statusRes.json();
            console.log(`[EXTRACT-PDF] Polling Mathpix... Status: ${statusData.status}`);
            
            if (statusData.status === 'completed') {
                isCompleted = true;
            } else if (statusData.status === 'error') {
                throw new Error("Mathpix PDF processing failed");
            }
            pollCount++;
        }

        if (!isCompleted) throw new Error("Mathpix processing timed out");

        // 3. Fetch Markdown
        console.log(`[EXTRACT-PDF] Fetching markdown result...`);
        const mdRes = await fetch(`https://api.mathpix.com/v3/pdf/${pdfId}.md`, {
            headers: {
                "app_id": process.env.MATHPIX_APP_ID!,
                "app_key": process.env.MATHPIX_APP_KEY!
            }
        });
        const rawText = await mdRes.text();
        console.log(`[EXTRACT-PDF] Extracted ${rawText.length} characters of Markdown.`);

        // 4. Rule-based question extraction
        console.log(`[EXTRACT-PDF] Parsing questions via rule-based engine...`);
        const extractedQuestions = parseMathpixMarkdown(rawText);
        console.log(`[EXTRACT-PDF] Found ${extractedQuestions.length} questions.`);

        // 5. Resolve taxonomy info
        let resolvedClassName = "Class 12";
        let resolvedSubjectName = "Mathematics";

        if (taxonomyIds.length > 0) {
            const firstTaxonomy = await prisma.tagTaxonomy.findUnique({
                where: { id: taxonomyIds[0] },
                include: {
                    parent: {
                        include: {
                            parent: {
                                include: { parent: true }
                            }
                        }
                    }
                }
            });
            if (firstTaxonomy) {
                let node: any = firstTaxonomy;
                while (node) {
                    if (node.type === 'CLASS') resolvedClassName = node.name;
                    if (node.type === 'SUBJECT') resolvedSubjectName = node.name;
                    node = node.parent;
                }
            }
        }

        // 6. Save to DB as DRAFT
        const userRole = (session.user as any).role;
        let savedCount = 0;

        for (const q of extractedQuestions) {
            const validTypes = ['SINGLE_CHOICE', 'MULTIPLE_CHOICE', 'INTEGER', 'TRUE_FALSE', 'SUBJECTIVE', 'FILL_IN_BLANKS', 'ASSERTION_REASONING', 'CASE_STUDY', 'VERY_SHORT_ANSWER', 'SHORT_ANSWER', 'LONG_ANSWER'];
            const validDifficulties = ['EASY', 'MEDIUM', 'HARD'];

            const questionData: any = {
                content: q.content,
                options: q.options,
                correctAnswer: q.correctAnswer,
                explanation: q.explanation,
                type: validTypes.includes(q.type) ? q.type : 'SINGLE_CHOICE',
                difficulty: validDifficulties.includes(q.difficulty) ? q.difficulty : 'MEDIUM',
                subject: resolvedSubjectName,
                class: resolvedClassName,
                examType: "JEE",
                tags: [],
                status: "DRAFT",
                scope: userRole === 'TEACHER' ? 'TEACHER_PRIVATE' : 'PUBLIC',
                originalRawText: q.rawText,
                createdById: (session.user as any).id || 'admin'
            };

            if (folderId) {
                questionData.knowledgeFolderId = folderId;
            }

            const createdQuestion = await prisma.question.create({
                data: questionData
            });

            for (const tid of taxonomyIds) {
                await prisma.questionTag.create({
                    data: {
                        questionId: createdQuestion.id,
                        tagId: tid
                    }
                });
            }

            savedCount++;
        }

        return NextResponse.json({ 
            success: true, 
            savedCount, 
            totalFound: extractedQuestions.length,
            rawMarkdown: rawText.substring(0, 50000) // Return first 50k chars for display
        });
    } catch (error: any) {
        console.error(`[EXTRACT-PDF] Fatal Error:`, error);
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
}

interface ParsedQuestion {
    content: string;
    options: string[];
    correctAnswer: string;
    explanation: string;
    type: string;
    difficulty: string;
    rawText: string;
}

enum SectionType {
    QUESTIONS = 'questions',
    SOLUTIONS = 'solutions',
    ANSWERS = 'answers',
    PRACTICE = 'practice',
    UNKNOWN = 'unknown'
}

interface DocumentSection {
    type: SectionType;
    startLine: number;
    endLine: number;
    lines: string[];
}

function parseMathpixMarkdown(text: string): ParsedQuestion[] {
    const lines = text.split('\n');
    const questions: ParsedQuestion[] = [];
    const solutionMap = new Map<string, string>();
    const answerMap = new Map<string, string>();
    
    // Section detection patterns
    const sectionHeaders = [
        { regex: /^(?:Solutions?|Solution\s*Key)\s*$/i, type: SectionType.SOLUTIONS },
        { regex: /^(?:Answers?|Answer\s*Key)\s*$/i, type: SectionType.ANSWERS },
        { regex: /^(?:Practice\s*(?:Exercise|Problems?|Questions?))\s*$/i, type: SectionType.PRACTICE },
        { regex: /^(?:Exercise|Exercises)\s*\d*\s*$/i, type: SectionType.PRACTICE },
        { regex: /^(?:MCQs?|Multiple\s*Choice)\s*$/i, type: SectionType.QUESTIONS },
        { regex: /^(?:Long\s*Answer\s*(?:Type\s*)?Questions?)\s*$/i, type: SectionType.QUESTIONS },
        { regex: /^(?:Short\s*Answer\s*(?:Type\s*)?Questions?)\s*$/i, type: SectionType.QUESTIONS },
    ];
    
    // Question patterns
    const questionStartRegex = /^(?:Q(?:uestion)?\.?\s*)?(\d+)[\.\)]\s+(.*)/i;
    const optionRegex = /^\s*\(?([A-Da-d])[\.\)]\s+(.*)/;
    const answerRegex = /(?:^|\s)(?:Ans(?:wer)?\.?|Correct\s*(?:option|answer)?)\s*[:\-]?\s*([A-Da-d](?:\s*,\s*[A-Da-d])*)/i;
    const solutionLineRegex = /^(?:Sol(?:ution)?\.?|Explanation)\s*[:\-]?\s*(.*)/i;
    const solutionNumberRegex = /^(?:Sol(?:ution)?\.?|Ans(?:wer)?\.?)\s*(\d+)\s*[:\-]?\s*(.*)/i;
    
    // First pass: Identify sections
    const sections: DocumentSection[] = [];
    let currentSection: DocumentSection = {
        type: SectionType.QUESTIONS,
        startLine: 0,
        endLine: lines.length - 1,
        lines: []
    };
    
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        
        // Check for section headers
        for (const header of sectionHeaders) {
            if (header.regex.test(line)) {
                // Close current section
                currentSection.endLine = i - 1;
                currentSection.lines = lines.slice(currentSection.startLine, i);
                sections.push(currentSection);
                
                // Start new section
                currentSection = {
                    type: header.type,
                    startLine: i + 1,
                    endLine: lines.length - 1,
                    lines: []
                };
                break;
            }
        }
    }
    
    // Close last section
    if (currentSection.startLine < lines.length) {
        currentSection.lines = lines.slice(currentSection.startLine);
        sections.push(currentSection);
    }
    
    console.log(`[PARSER] Found ${sections.length} sections:`);
    sections.forEach((s, i) => console.log(`  Section ${i}: ${s.type} (lines ${s.startLine}-${s.endLine})`));
    
    // Second pass: Parse questions from question/practice sections
    for (const section of sections) {
        if (section.type === SectionType.SOLUTIONS || section.type === SectionType.ANSWERS) {
            // Parse solutions/answers separately
            parseSolutionsSection(section.lines, solutionMap, answerMap);
            continue;
        }
        
        // Parse questions from this section
        parseQuestionsSection(section.lines, questions, solutionMap, answerMap);
    }
    
    // Third pass: Match solutions to questions by number
    matchSolutionsToQuestions(questions, solutionMap, answerMap);
    
    console.log(`[PARSER] Final: ${questions.length} questions, ${solutionMap.size} solutions, ${answerMap.size} answers`);
    return questions;
}

function parseSolutionsSection(
    lines: string[], 
    solutionMap: Map<string, string>, 
    answerMap: Map<string, string>
) {
    let currentNum: string | null = null;
    let currentText: string[] = [];
    
    const flushSolution = () => {
        if (currentNum && currentText.length > 0) {
            const text = currentText.join('\n').trim();
            if (text.length > 5) {
                // Check if it's just an answer (A, B, C, D) or a full solution
                if (/^[A-D](\s*,\s*[A-D])*$/.test(text)) {
                    answerMap.set(currentNum, text);
                } else {
                    solutionMap.set(currentNum, text);
                }
            }
        }
        currentNum = null;
        currentText = [];
    };
    
    for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        
        // Check for numbered solution
        const solMatch = trimmed.match(/^(?:Sol(?:ution)?\.?|Ans(?:wer)?\.?|Q\.?)\s*(\d+)\s*[:\-]?\s*(.*)/i);
        if (solMatch) {
            flushSolution();
            currentNum = solMatch[1];
            if (solMatch[2]) {
                currentText.push(solMatch[2]);
            }
            continue;
        }
        
        // Check for simple number pattern (1., 2., etc.) in solutions section
        const numMatch = trimmed.match(/^(\d+)[\.\)]\s*(.*)/);
        if (numMatch) {
            flushSolution();
            currentNum = numMatch[1];
            if (numMatch[2]) {
                currentText.push(numMatch[2]);
            }
            continue;
        }
        
        // Accumulate solution text
        if (currentNum) {
            currentText.push(trimmed);
        }
    }
    
    flushSolution();
}

function parseQuestionsSection(
    lines: string[], 
    questions: ParsedQuestion[],
    solutionMap: Map<string, string>,
    answerMap: Map<string, string>
) {
    let currentQuestion: ParsedQuestion | null = null;
    let potentialOptions: string[] = [];
    let optionStartLine = -1;
    let inSolution = false;
    
    const flushQuestion = () => {
        if (currentQuestion && currentQuestion.content.trim().length > 5) {
            currentQuestion.content = currentQuestion.content.trim().replace(/\n\s*\n/g, '\n');
            currentQuestion.explanation = currentQuestion.explanation.trim().replace(/\n\s*\n/g, '\n');
            
            if (potentialOptions.length >= 2 && potentialOptions.length <= 4 && optionStartLine > 0) {
                currentQuestion.options = potentialOptions;
                currentQuestion.type = 'SINGLE_CHOICE';
            } else {
                currentQuestion.options = [];
                currentQuestion.type = 'INTEGER';
            }
            
            questions.push(currentQuestion);
        }
        currentQuestion = null;
        potentialOptions = [];
        optionStartLine = -1;
        inSolution = false;
    };
    
    const commitOptions = () => {
        if (potentialOptions.length >= 2 && potentialOptions.length <= 4 && currentQuestion) {
            currentQuestion.options = potentialOptions;
            currentQuestion.type = 'SINGLE_CHOICE';
        }
        potentialOptions = [];
        optionStartLine = -1;
    };
    
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;
        
        // Check for new question
        const qMatch = line.match(/^(?:Q(?:uestion)?\.?\s*)?(\d+)[\.\)]\s+(.*)/i);
        if (qMatch) {
            flushQuestion();
            currentQuestion = {
                content: qMatch[2] || '',
                options: [],
                correctAnswer: '',
                explanation: '',
                type: 'INTEGER',
                difficulty: 'MEDIUM',
                rawText: line
            };
            inSolution = false;
            continue;
        }
        
        if (!currentQuestion) continue;
        
        // Check for inline solution marker
        const solMatch = line.match(/^(?:Sol(?:ution)?\.?|Explanation)\s*[:\-]?\s*(.*)/i);
        if (solMatch) {
            inSolution = true;
            commitOptions();
            if (solMatch[1]) {
                currentQuestion.explanation += (currentQuestion.explanation ? '\n' : '') + solMatch[1];
            }
            continue;
        }
        
        // Check for answer
        const ansMatch = line.match(/(?:^|\s)(?:Ans(?:wer)?\.?|Correct\s*(?:option|answer)?)\s*[:\-]?\s*([A-Da-d](?:\s*,\s*[A-Da-d])*)/i);
        if (ansMatch && !inSolution) {
            currentQuestion.correctAnswer = ansMatch[1].toUpperCase().replace(/\s/g, '');
            continue;
        }
        
        // Check for option
        const optMatch = line.match(/^\s*\(?([A-Da-d])[\.\)]\s+(.*)/);
        if (optMatch && !inSolution) {
            const optLetter = optMatch[1].toUpperCase();
            const expectedLetters = ['A', 'B', 'C', 'D', 'E'];
            const expectedIndex = potentialOptions.length;
            
            if (expectedLetters[expectedIndex] === optLetter) {
                if (potentialOptions.length === 0) {
                    optionStartLine = i;
                }
                potentialOptions.push(optMatch[2]);
            } else {
                commitOptions();
                currentQuestion.content += '\n' + line;
            }
            continue;
        }
        
        // If we had potential options but this line breaks the pattern
        if (potentialOptions.length > 0 && !optMatch) {
            commitOptions();
        }
        
        // If in solution mode, accumulate
        if (inSolution) {
            currentQuestion.explanation += (currentQuestion.explanation ? '\n' : '') + line;
            continue;
        }
        
        // Default: add to question content
        currentQuestion.content += (currentQuestion.content ? '\n' : '') + line;
    }
    
    flushQuestion();

    // Post-processing
    for (const q of questions) {
        if (q.options.length === 0) {
            q.type = 'INTEGER';
            q.options = [];
        } else if (q.options.length >= 2 && q.options.length <= 4) {
            q.type = 'SINGLE_CHOICE';
            if (q.correctAnswer.length > 1) {
                q.type = 'MULTIPLE_CHOICE';
            }
        } else {
            q.options = [];
            q.type = 'INTEGER';
        }
    }
    
    return questions;
}


function matchSolutionsToQuestions(
    questions: ParsedQuestion[],
    solutionMap: Map<string, string>,
    answerMap: Map<string, string>
) {
    for (const q of questions) {
        // Extract question number
        const numMatch = q.rawText.match(/(\d+)/);
        if (!numMatch) continue;
        
        const qNum = numMatch[1];
        
        // Match solution first
        if (!q.explanation && solutionMap.has(qNum)) {
            q.explanation = solutionMap.get(qNum)!;
        }
        
        // Match answer
        if (!q.correctAnswer && answerMap.has(qNum)) {
            q.correctAnswer = answerMap.get(qNum)!;
        }
    }
}
