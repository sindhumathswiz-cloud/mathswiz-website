import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { GoogleGenerativeAI } from "@google/generative-ai";

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
        
        IMPORTANT: If you find standalone solutions/explanations that do not have a corresponding question in this text, output them with the "type" set to "[STANDALONE_SOLUTION]". Put the solution text into the "explanation" field.
        
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
            await prisma.question.create({
                data: {
                    content: q.content || "",
                    options: q.options || [],
                    correctAnswer: q.correctAnswer || "",
                    explanation: q.explanation || "",
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
