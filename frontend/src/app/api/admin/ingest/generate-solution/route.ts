import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { fetchFromLLM } from "@/lib/llm";
import { sanitizeLatex } from "@/lib/latex-sanitizer";

const SOLUTION_PROMPT = `You are a math solution generator. Given a question with optional correct answer, generate a detailed step-by-step solution.

Format your response as STRICT JSON:
{
  "steps": [
    { "stepNumber": 1, "type": "FORMULA", "content": "Write given: f(x) = x^2", "explanation": "We start by writing the given function" },
    { "stepNumber": 2, "type": "CALCULATION", "content": "f'(x) = 2x", "explanation": "Differentiate using power rule" },
    { "stepNumber": 3, "type": "FINAL_ANSWER", "content": "2x", "explanation": "This is the derivative" }
  ],
  "finalAnswer": "2x",
  "fullSolution": "We start by writing the given function... (full solution text with LaTeX)"
}

Rules:
- Include ALL working steps. Be thorough but clear.
- Use $...$ for inline LaTeX and $$...$$ for display math
- The "fullSolution" field should contain the complete solution as a single string with LaTeX formatting
- If the question has options (MCQ), explain why the correct option is right and others are wrong
- If a correct answer is provided, show how to arrive at it step by step`;

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { question, correctAnswer, options, existingSolution } = body;

    if (!question) {
      return NextResponse.json({ success: false, error: "question is required" }, { status: 400 });
    }

    const sanitizedQuestion = sanitizeLatex(question);
    const sanitizedAnswer = sanitizeLatex(correctAnswer);
    const sanitizedExisting = sanitizeLatex(existingSolution);

    const userContent = `Question: ${sanitizedQuestion}
Options: ${JSON.stringify(options || [])}
Correct Answer: ${sanitizedAnswer || 'Not provided'}
Existing Solution: ${sanitizedExisting || 'None'}

Generate a detailed step-by-step solution for this question.`;

    const raw = await fetchFromLLM(
      SOLUTION_PROMPT,
      userContent
    );

    const cleaned = raw.replace(/```json/gi, '').replace(/```/g, '').trim();
    const parsed = JSON.parse(cleaned);

    return NextResponse.json({
      success: true,
      steps: parsed.steps || [],
      fullSolution: sanitizeLatex(parsed.fullSolution || ''),
      finalAnswer: parsed.finalAnswer || correctAnswer || '',
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Solution generation failed';
    console.error('[INGEST-GENERATE-SOLUTION] Error:', message);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
