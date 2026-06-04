import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { sanitizeLatex } from "@/lib/latex-sanitizer";
import { checkBlockingDuplicate } from "@/lib/duplicate-checker";
import { computeContentHash } from "@/lib/question-classifier";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');

export async function POST(request: NextRequest) {
    try {
        const session = await getServerSession(authOptions);
        if (!session) {
            console.error("[AUTH ERROR] No session found in extract-chunk route");
            return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
        }

        const { chunkText, folderId, adminId } = await request.json();
        
        if (!chunkText || !folderId) {
            return NextResponse.json({ success: false, error: "Missing chunkText or folderId" }, { status: 400 });
        }

        console.log(`[EXTRACT-CHUNK] Processing chunk of length ${chunkText.length} for folder ${folderId}`);

        const model = genAI.getGenerativeModel({ model: "gemini-1.5-pro-latest" });
        const systemPrompt = `You are a math question extraction AI.
        Given raw Markdown text from an OCR tool, extract individual questions.
        For each question, output a JSON object in this format:
        {
          "content": "LaTeX question text",
          "options": ["A", "B", "C", "D"],
          "correctAnswer": "A",
          "explanation": "LaTeX solution",
          "type": "SINGLE_CHOICE",
          "difficulty": "MEDIUM",
          "subject": "Mathematics",
          "classLevel": "Class 11",
          "examType": "JEE",
          "tags": ["Tag1"]
        }
        
        CRITICAL RULES:
        1. NEVER output standalone solutions/answers as separate items. If text contains only a solution/answer without a corresponding question, SKIP it entirely.
        2. ALWAYS provide an "explanation" field with the step-by-step solution for EVERY question.
        3. For SINGLE_CHOICE and ASSERTION_REASONING questions, identify the correct option and put the LETTER (e.g. "A", "B", "C", "D") in "correctAnswer". For integer/numerical answer questions, put the numeric answer in "correctAnswer". Fill "correctAnswer" for ALL questions that have a definitive answer.
        4. Every "content" field MUST contain a full question sentence (not just a math expression). Minimum 10 characters of readable text.
        5. Classify types as: SINGLE_CHOICE, INTEGER, SUBJECTIVE, TRUE_FALSE, FILL_IN_BLANKS, ASSERTION_REASONING, CASE_STUDY, VERY_SHORT_ANSWER, SHORT_ANSWER, LONG_ANSWER
        
        Return a JSON array of these objects. ONLY RETURN VALID JSON.`;

        const result = await model.generateContent({
            contents: [{ role: 'user', parts: [{ text: `${systemPrompt}\n\nRAW TEXT:\n${chunkText}` }] }]
        });
        
        const text = result.response.text();
        const jsonMatch = text.match(/\[[\s\S]*\]/);
        const extractedQuestions = jsonMatch ? JSON.parse(jsonMatch[0]) : [];

        console.log(`[EXTRACT-CHUNK] Gemini found ${extractedQuestions.length} items`);

        let savedCount = 0;
        const userRole = (session.user as any).role;
        for (const q of extractedQuestions) {
            // Skip standalone solutions that Gemini couldn't attach to a question
            if (q.type === '[STANDALONE_SOLUTION]') continue;

            const sanitizedContent = sanitizeLatex(q.content);
            const sanitizedExplanation = sanitizeLatex(q.explanation);
            const sanitizedCorrectAnswer = sanitizeLatex(q.correctAnswer);

            // Skip content that is just a math expression without actual question text
            if (!sanitizedContent || sanitizedContent.replace(/\$/g, '').trim().length < 10) continue;
            // Skip if content has no letters (pure formula/answer with no question)
            if (!/[A-Za-z]{3,}/.test(sanitizedContent.replace(/\\[a-z]+/g, ''))) continue;

            if (sanitizedContent) {
                const dupCheck = await checkBlockingDuplicate(sanitizedContent);
                if (dupCheck.isDuplicate) continue;
            }

            await prisma.question.create({
                data: {
                    content: sanitizedContent || "",
                    options: q.options || [],
                    correctAnswer: sanitizedCorrectAnswer || "",
                    explanation: sanitizedExplanation || "",
                    contentHash: sanitizedContent ? computeContentHash(sanitizedContent) : null,
                    type: q.type || "SINGLE_CHOICE",
                    difficulty: q.difficulty || "MEDIUM",
                    subject: q.subject || "Mathematics",
                    class: q.class || "Class 12",
                    examType: q.examType || "JEE",
                    tags: q.tags || [],
                    status: "DRAFT",
                    scope: userRole === 'TEACHER' ? 'TEACHER_PRIVATE' : 'PUBLIC',
                    originalRawText: chunkText,
                    createdById: adminId || (session.user as any).id
                }
            });
            savedCount++;
        }

        return NextResponse.json({ success: true, savedCount });
    } catch (error: any) {
        console.error(`[EXTRACT-CHUNK] Error:`, error);
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
}
