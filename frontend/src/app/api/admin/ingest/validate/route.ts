import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { fetchFromLLM } from "@/lib/llm";
import { classifyQuestion } from "@/lib/question-classifier";
import { checkBlockingDuplicate } from "@/lib/duplicate-checker";
import { sanitizeLatex } from "@/lib/latex-sanitizer";

const VALIDATION_PROMPT = `You are a math question validation AI. Given a question, check for:

1. Is this a valid exam/math question? (not a heading, page number, instruction text, or image)
2. Does the solution actually answer the question?
3. Are the LaTeX delimiters correct?
4. Is the question type correct?
5. Number of options matches the type (MCQ needs 2-6 options)
6. Is the question complete (not truncated)?

Respond with valid JSON:
{
  "valid": true,
  "issues": [],
  "warnings": [],
  "suggestedType": "SINGLE_CHOICE",
  "suggestedDifficulty": "MEDIUM",
  "confidence": 90
}`;

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { questions } = body;

    if (!Array.isArray(questions) || questions.length === 0) {
      return NextResponse.json({ success: false, error: "questions array is required" }, { status: 400 });
    }

    const results = [];
    for (const q of questions) {
      const sanitized = sanitizeLatex(q.content);
      const hasSolution = !!(q.explanation || q.solution || q.correctAnswer);
      const dupCheck = await checkBlockingDuplicate(sanitized || '');

      const classification = await classifyQuestion(sanitized || '', q.options);

      const issues: string[] = [];
      const warnings: string[] = [];

      if (dupCheck.isDuplicate) {
        warnings.push(`Question appears to be a duplicate of an existing ${dupCheck.existingQuestionStatus?.toLowerCase()} question.`);
      }

      if (!sanitized || sanitized.length < 10) {
        issues.push('Question text is too short or empty.');
      }

      if (q.options && Array.isArray(q.options) && q.options.length >= 2) {
        if (q.options.filter((o: string) => o.trim()).length < 2) {
          warnings.push('Fewer than 2 non-empty options for an MCQ-type question.');
        }
      }

      if (!hasSolution) {
        warnings.push('No solution or explanation provided. Consider generating one with AI.');
      }

      const typeClass = classification.type;
      if (typeClass === 'SINGLE_CHOICE' || typeClass === 'MULTIPLE_CHOICE') {
        if (!q.options || q.options.length < 2) {
          warnings.push(`Type is ${typeClass} but no options found.`);
        }
      }

      try {
        // Use LLM for deep validation
        const llmResponse = await fetchFromLLM(
          VALIDATION_PROMPT,
          `Question: ${sanitized}
Options: ${JSON.stringify(q.options || [])}
Solution: ${q.explanation || q.solution || ''}
Correct Answer: ${q.correctAnswer || ''}

Validate this question.`
        );
        const cleaned = llmResponse.replace(/```json/gi, '').replace(/```/g, '').trim();
        const llmResult = JSON.parse(cleaned);

        if (llmResult.issues) issues.push(...llmResult.issues);
        if (llmResult.warnings) warnings.push(...llmResult.warnings);
        results.push({
          _tempId: q._tempId || null,
          valid: issues.length === 0,
          issues,
          warnings,
          suggestedType: llmResult.suggestedType || classification.type,
          suggestedDifficulty: llmResult.suggestedDifficulty || classification.difficulty,
          confidence: llmResult.confidence || 50,
        });
      } catch {
        // LLM parse failed, use heuristic-only result
        results.push({
          _tempId: q._tempId || null,
          valid: issues.length === 0,
          issues,
          warnings,
          suggestedType: classification.type,
          suggestedDifficulty: classification.difficulty,
          confidence: 50,
        });
      }
    }

    return NextResponse.json({ success: true, results });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Validation failed';
    console.error('[INGEST-VALIDATE] Error:', message);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
