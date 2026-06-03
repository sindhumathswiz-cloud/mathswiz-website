import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { cleanMathpixMarkdown } from "@/lib/mathpix-parser";

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

        // 4. Clean Mathpix output before parsing
        console.log(`[EXTRACT-PDF] Cleaning Mathpix markdown...`);
        const cleanedText = cleanMathpixMarkdown(rawText);

        // 5. Rule-based question extraction
        console.log(`[EXTRACT-PDF] Parsing questions via rule-based engine...`);
        const extractedQuestions = parseMathpixMarkdown(cleanedText);
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

function parseMathpixMarkdown(text: string): ParsedQuestion[] {
    const lines = text.split('\n');
    const questions: ParsedQuestion[] = [];
    const solutionMap = new Map<string, string>();
    const answerMap = new Map<string, string>();
    // Track which line indices belong to solutions so we skip them in question pass
    const solutionLineIndices = new Set<number>();

    // -- Section detection patterns --
    const sectionHeaders: { regex: RegExp; type: 'questions' | 'solutions' | 'answers' | 'practice' }[] = [
        { regex: /^(?:Solutions?|Solution\s*Key)\s*$/i, type: 'solutions' },
        { regex: /^(?:Answers?|Answer\s*Key)\s*$/i, type: 'answers' },
        { regex: /^(?:Practice\s*(?:Exercise|Problems?|Questions?))\s*$/i, type: 'practice' },
        { regex: /^(?:Exercise|Exercises)\s*\d*\s*$/i, type: 'practice' },
        { regex: /^(?:MCQs?|Multiple\s*Choice)\s*$/i, type: 'questions' },
        { regex: /^(?:Long\s*Answer\s*(?:Type\s*)?Questions?)\s*$/i, type: 'questions' },
        { regex: /^(?:Short\s*Answer\s*(?:Type\s*)?Questions?)\s*$/i, type: 'questions' },
    ];

    // ──────────── FIRST PASS: section splitting ────────────
    interface DocSection { type: string; startLine: number; endLine: number; lines: string[]; headerIndex: number; }
    const sections: DocSection[] = [];
    let currentSection: DocSection = { type: 'questions', startLine: 0, endLine: lines.length - 1, lines: [], headerIndex: -1 };

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        let matched = false;
        for (const header of sectionHeaders) {
            if (header.regex.test(line)) {
                currentSection.endLine = i - 1;
                currentSection.lines = lines.slice(currentSection.startLine, i);
                sections.push(currentSection);
                currentSection = { type: header.type, startLine: i + 1, endLine: lines.length - 1, lines: [], headerIndex: i };
                matched = true;
                break;
            }
        }
        // Also treat standalone "##" section headers as breaks
        if (!matched && /^##\s+\S/.test(line)) {
            currentSection.endLine = i - 1;
            currentSection.lines = lines.slice(currentSection.startLine, i);
            sections.push(currentSection);
            currentSection = { type: 'unknown', startLine: i + 1, endLine: lines.length - 1, lines: [], headerIndex: i };
        }
    }
    if (currentSection.startLine < lines.length) {
        currentSection.lines = lines.slice(currentSection.startLine);
        sections.push(currentSection);
    }

    // ──────────── SECOND PASS: parse solutions/answers sections ────────────
    for (const section of sections) {
        if (section.type === 'solutions' || section.type === 'answers') {
            parseSolutionsSection(section.lines, solutionMap, answerMap, solutionLineIndices, section.startLine);
        }
    }

    // ──────────── THIRD PASS: detect INLINE solutions in question sections ────────────
    // Scan for inline "Sol.", "Solution:", "Ans.", "Answer:" markers
    for (const section of sections) {
        if (section.type === 'questions' || section.type === 'practice' || section.type === 'unknown') {
            parseInlineSolutionLines(
                lines, section.startLine, section.startLine + section.lines.length,
                solutionMap, solutionLineIndices
            );
        }
    }

    // ──────────── FOURTH PASS: parse questions (skipping solution lines) ────────────
    for (const section of sections) {
        if (section.type === 'questions' || section.type === 'practice' || section.type === 'unknown') {
            parseQuestionsSection(
                lines, section.startLine, section.startLine + section.lines.length,
                questions, solutionLineIndices, solutionMap, answerMap
            );
        }
    }

    // ──────────── FIFTH PASS: match solutions to questions by number ────────────
    matchSolutionsToQuestions(questions, solutionMap, answerMap);

    // ──────────── SIXTH PASS: filter out solution-only entries mis-parsed as questions ────────────
    const filtered = questions.filter(q => {
        if (!q.rawText) return true;
        const firstLine = q.rawText.split('\n')[0].trim();
        // If a "question" starts with "Sol." or "Solution:" it's really a solution
        if (/^(?:Sol(?:ution)?\.?|Ans(?:wer)?\.?)\b/i.test(firstLine)) return false;
        // If the content is extremely short and has solution keywords
        if (q.content.length < 15 && /^(?:Sol|Ans|Hence|Therefore|Thus)/i.test(q.content)) return false;
        return true;
    });

    console.log(`[PARSER] Final: ${filtered.length} questions, ${solutionMap.size} solutions, ${answerMap.size} answers (filtered ${questions.length - filtered.length} solution-as-question entries)`);
    return filtered;
}

function parseSolutionsSection(
    lines: string[],
    solutionMap: Map<string, string>,
    answerMap: Map<string, string>,
    solutionLineIndices: Set<number>,
    baseOffset: number
) {
    let currentNum: string | null = null;
    let currentText: string[] = [];
    let currentStartIdx = -1;

    const flush = () => {
        if (currentNum && currentText.length > 0) {
            const text = currentText.join('\n').trim();
            if (text.length > 3) {
                if (/^[A-D](\s*,\s*[A-D])*$/.test(text)) {
                    answerMap.set(currentNum, text);
                } else {
                    solutionMap.set(currentNum, text);
                }
            }
            // Mark all lines in this solution block as solution lines
            if (currentStartIdx >= 0) {
                for (let j = currentStartIdx; j < currentStartIdx + currentText.length; j++) {
                    solutionLineIndices.add(baseOffset + j);
                }
            }
        }
        currentNum = null;
        currentText = [];
        currentStartIdx = -1;
    };

    for (let i = 0; i < lines.length; i++) {
        const trimmed = lines[i].trim();
        if (!trimmed) continue;

        // "Sol 1." or "Ans 1." or "Q.1" prefix
        const solMatch = trimmed.match(/^(?:Sol(?:ution)?\.?|Ans(?:wer)?\.?|Q\.?)\s*(\d+)\s*[:\-]?\s*(.*)/i);
        if (solMatch) {
            flush();
            currentNum = solMatch[1];
            currentStartIdx = i;
            if (solMatch[2]) {
                currentText.push(solMatch[2]);
            }
            continue;
        }

        // Bare number: "1." or "1)" in a known solutions section
        const numMatch = trimmed.match(/^(\d+)[\.\)]\s*(.*)/);
        if (numMatch) {
            flush();
            currentNum = numMatch[1];
            currentStartIdx = i;
            if (numMatch[2]) {
                currentText.push(numMatch[2]);
            }
            continue;
        }

        if (currentNum) {
            currentText.push(trimmed);
        }
    }
    flush();
}

function parseInlineSolutionLines(
    allLines: string[],
    startIdx: number,
    endIdx: number,
    solutionMap: Map<string, string>,
    solutionLineIndices: Set<number>
) {
    let currentNum: string | null = null;
    let currentText: string[] = [];
    let currentStart = -1;
    let inInlineSol = false;

    const flush = () => {
        if (currentNum && currentText.length > 0 && currentStart >= 0) {
            const text = currentText.join('\n').trim();
            if (text.length > 5 && !solutionMap.has(currentNum)) {
                solutionMap.set(currentNum, text);
                for (let j = currentStart; j < currentStart + currentText.length; j++) {
                    solutionLineIndices.add(startIdx + j);
                }
            }
        }
        currentNum = null;
        currentText = [];
        currentStart = -1;
        inInlineSol = false;
    };

    for (let i = 0; i < endIdx - startIdx; i++) {
        const idx = startIdx + i;
        if (idx >= allLines.length) break;
        const trimmed = allLines[idx].trim();
        if (!trimmed) continue;

        // Check for inline Sol/Ans prefix (with optional number): "Sol. 12." or "Sol. x = 5"
        const solMatch = trimmed.match(/^(?:Sol(?:ution)?\.?|Ans(?:wer)?\.?)\s*(\d*)\s*[:\-]?\s*(.*)/i);
        if (solMatch) {
            // If a number follows "Sol", use it as the solution number
            if (solMatch[1]) {
                flush();
                currentNum = solMatch[1];
                currentStart = i;
                if (solMatch[2]) {
                    currentText.push(solMatch[2]);
                }
                inInlineSol = true;
            } else {
                // "Sol." without number — attach to previous question later
                flush();
                inInlineSol = true;
                currentStart = i;
                if (solMatch[2]) {
                    currentText.push(solMatch[2]);
                }
            }
            continue;
        }

        if (inInlineSol) {
            // Check if we've hit a new numbered question
            if (/^(?:Q(?:uestion)?\.?\s*)?\d+[\.\)]\s/.test(trimmed)) {
                flush();
                continue;
            }
            currentText.push(trimmed);
        }
    }
    flush();
}

function parseQuestionsSection(
    allLines: string[],
    startIdx: number,
    endIdx: number,
    questions: ParsedQuestion[],
    solutionLineIndices: Set<number>,
    solutionMap: Map<string, string>,
    answerMap: Map<string, string>
) {
    let currentQuestion: ParsedQuestion | null = null;
    let potentialOptions: { letter: string; text: string }[] = [];
    let afterQuestionTextLine = 0; // track that we had at least one text line before options
    let seenSolutionBlock = false;

    const flushQuestion = () => {
        if (!currentQuestion) return;
        const content = currentQuestion.content.trim();
        if (content.length <= 5) {
            currentQuestion = null;
            potentialOptions = [];
            return;
        }

        // Determine type from options
        if (potentialOptions.length >= 2 && potentialOptions.length <= 6) {
            currentQuestion.options = potentialOptions.map(o => o.text);
            currentQuestion.type = currentQuestion.correctAnswer && currentQuestion.correctAnswer.length > 1
                ? 'MULTIPLE_CHOICE' : 'SINGLE_CHOICE';
        } else {
            currentQuestion.options = [];
            currentQuestion.type = 'INTEGER';
        }

        // Clean content
        currentQuestion.content = content.replace(/\n{3,}/g, '\n\n');

        if (currentQuestion.content.length > 3) {
            questions.push(currentQuestion);
        }
        currentQuestion = null;
        potentialOptions = [];
        afterQuestionTextLine = 0;
        seenSolutionBlock = false;
    };

    for (let i = 0; i < endIdx - startIdx; i++) {
        const idx = startIdx + i;
        if (idx >= allLines.length) break;

        // Skip lines flagged as solution content
        if (solutionLineIndices.has(idx)) continue;

        const line = allLines[idx];
        const trimmed = line.trim();
        if (!trimmed) continue;

        // Detect "## " section header — stop parsing
        if (/^##\s+\S/.test(trimmed)) { flushQuestion(); break; }

        // Detect a new question number
        const qMatch = trimmed.match(/^(?:Q(?:uestion)?\.?\s*)?(\d+)[\.\)]\s+(.*)/i);
        if (qMatch) {
            flushQuestion();
            currentQuestion = {
                content: qMatch[2] || '',
                options: [],
                correctAnswer: '',
                explanation: '',
                type: 'INTEGER',
                difficulty: 'MEDIUM',
                rawText: line,
            };
            afterQuestionTextLine = qMatch[2] ? 1 : 0;
            potentialOptions = [];
            continue;
        }

        if (!currentQuestion) continue;

        // Check for answer line: "Ans: A", "Answer: B", "Correct option: C"
        const ansMatch = trimmed.match(/(?:^|\s)(?:Ans(?:wer)?\.?|Correct\s*(?:option|answer)?)\s*[:\-]?\s*([A-Da-d](?:\s*,\s*[A-Da-d])*)/i);
        if (ansMatch) {
            currentQuestion.correctAnswer = ansMatch[1].toUpperCase().replace(/\s/g, '');
            continue;
        }

        // Check for option line: "(A) ..." "A. ..." "A) ..."
        const optMatch = trimmed.match(/^\s*\(?([A-Da-d])\)?[\.\)]\s+(.*)/);
        if (optMatch) {
            const letter = optMatch[1].toUpperCase();
            // Only accept if letter is A-D
            if (['A', 'B', 'C', 'D'].includes(letter)) {
                potentialOptions.push({ letter, text: optMatch[2] });
                continue;
            }
        }

        // If we're collecting options and hit text that isn't an option,
        // check if we need to flush options (e.g. new question content after options done)
        if (potentialOptions.length >= 2) {
            // If we see a line that doesn't start with A-D, commit options
            const looksLikeAnswer = /^(?:Ans|Correct|Hence|Therefore|Thus|Sol)/i.test(trimmed);
            if (looksLikeAnswer || trimmed.startsWith('**')) {
                if (potentialOptions.length >= 2) {
                    currentQuestion.options = potentialOptions.map(o => o.text);
                    currentQuestion.type = 'SINGLE_CHOICE';
                }
                potentialOptions = [];
                currentQuestion.content += '\n' + trimmed;
                continue;
            }
            // If it's a short line (likely continuation), don't break options
        }

        // Accumulate into question content
        if (currentQuestion.content) {
            currentQuestion.content += '\n' + trimmed;
        } else {
            currentQuestion.content = trimmed;
        }
        afterQuestionTextLine++;
    }

    flushQuestion();

    // Post-processing: default types
    for (const q of questions) {
        if (!q.options || q.options.length === 0) {
            q.options = [];
            if (q.type !== 'INTEGER') q.type = 'INTEGER';
        }
    }
}

function matchSolutionsToQuestions(
    questions: ParsedQuestion[],
    solutionMap: Map<string, string>,
    answerMap: Map<string, string>
) {
    for (const q of questions) {
        const numMatch = q.rawText.match(/(\d+)/);
        if (!numMatch) continue;
        const qNum = numMatch[1];

        if (!q.explanation && solutionMap.has(qNum)) {
            q.explanation = solutionMap.get(qNum)!;
        }
        if (!q.correctAnswer && answerMap.has(qNum)) {
            q.correctAnswer = answerMap.get(qNum)!;
        }
    }
}
