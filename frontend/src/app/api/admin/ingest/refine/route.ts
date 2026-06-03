import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { fetchFromLLM } from "@/lib/llm";

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const questions: { _tempId: string; content: string }[] = body.questions;

    if (!Array.isArray(questions) || questions.length === 0) {
      return NextResponse.json({ success: false, error: "questions array is required" }, { status: 400 });
    }

    // Batch up to 10 questions per LLM call
    const batchSize = 10;
    const refinedQuestions: any[] = [];

    for (let i = 0; i < questions.length; i += batchSize) {
      const batch = questions.slice(i, i + batchSize);
      const problemsText = batch.map((q, j) => `--- Problem ${j + 1} ---\n${q.content}`).join('\n\n');

      const systemPrompt = `You extract structured question data from raw math problem text. Return STRICT JSON: {"questions": [{"_tempId": "...", "type": "SINGLE_CHOICE" or "NUMERICAL" or "INTEGER" or "TRUE_FALSE" or "SUBJECTIVE", "options": ["A", "B", "C", "D"] or [], "correctAnswer": "...", "explanation": "..."}]}

Rules:
- For MCQs: include options array and correctAnswer letter
- For numerical/subjective: leave options as [] and put final answer in correctAnswer
- If the problem includes a solution, put it in explanation
- Use $...$ for inline LaTeX and $$...$$ for display math
- _tempId must match exactly what was provided
- If no answer visible, leave correctAnswer as ""`;

      const userPrompt = `Extract structured data from these problems. Preserve the _tempId:\n\n${problemsText}`;

      const raw = await fetchFromLLM(systemPrompt, userPrompt);
      const cleaned = raw.replace(/```json/gi, "").replace(/```/g, "").trim();
      const parsed = JSON.parse(cleaned);
      const parsedQuestions = Array.isArray(parsed) ? parsed : (parsed.questions || []);

      refinedQuestions.push(...parsedQuestions);
    }

    return NextResponse.json({ success: true, questions: refinedQuestions });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Refinement failed";
    console.error("[INGEST-REFINE] Error:", message);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
