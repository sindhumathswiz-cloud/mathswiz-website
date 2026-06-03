import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { fetchFromLLM } from "@/lib/llm";

const MAX_PROMPT_CHARS = 8000;

function truncateText(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  // Keep first and last parts to preserve question starts and solutions
  const half = Math.floor(maxChars / 2);
  return text.substring(0, half) + '\n\n... [content truncated for length] ...\n\n' + text.substring(text.length - half);
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }
    const userId = (session.user as { id: string }).id;

    const { id: sessionId } = await params;

    const extractionSession = await prisma.extractionSession.findUnique({
      where: { id: sessionId },
      include: {
        sourceDocument: {
          include: {
            pages: { orderBy: { pageNumber: 'asc' } }
          }
        },
        solutionDocument: {
          include: {
            pages: { orderBy: { pageNumber: 'asc' } }
          }
        }
      }
    });

    if (!extractionSession) {
      return NextResponse.json({ success: false, error: "Session not found" }, { status: 404 });
    }
    if (extractionSession.userId !== userId) {
      return NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 });
    }

    const questionPages = extractionSession.sourceDocument?.pages || [];
    const allQuestionText = questionPages.map(p => `--- PAGE ${p.pageNumber} ---\n${p.rawMarkdown}`).join('\n\n');

    const solutionPages = extractionSession.solutionDocument?.pages || [];
    const allSolutionText = solutionPages.map(p => `--- PAGE ${p.pageNumber} ---\n${p.rawMarkdown}`).join('\n\n');

    if (!allQuestionText.trim()) {
      return NextResponse.json({ success: false, error: "No question content found in session" }, { status: 400 });
    }

    // Truncate to avoid context window limits
    const truncatedQuestions = truncateText(allQuestionText, MAX_PROMPT_CHARS);
    const truncatedSolutions = allSolutionText ? truncateText(allSolutionText, MAX_PROMPT_CHARS) : '';

    const systemPrompt = `You are a JSON-only question extraction engine. Return ONLY a JSON object. No text before or after. No markdown. No explanations.

Extract every question from the OCR text below into this exact JSON structure:
{"questions":[{"number":null,"type":"MCQ","question":"","options":[{"label":"A","text":""}],"correctOption":null,"assertion":null,"reasoning":null,"passage":null,"subQuestions":null,"solution":null,"tags":[]}]}

Types: MCQ, ASSERTION_REASONING, CASE_STUDY, VERY_SHORT_ANSWER, SHORT_ANSWER, LONG_ANSWER, FILL_IN_THE_BLANK
Fix broken LaTeX. Use $...$ for inline math. Convert \left\{\begin{array}{ll} to \begin{cases}.`;

    const userPrompt = `Total pages: ${questionPages.length} question pages, ${solutionPages.length} solution pages.

=== QUESTIONS ===
${truncatedQuestions}

${truncatedSolutions ? `\n=== SOLUTIONS ===\n${truncatedSolutions}` : ''}

Extract all questions. Fix any broken LaTeX. Return complete JSON.`;

    const llmResponse = await fetchFromLLM(systemPrompt, userPrompt);

    function sanitizeJSON(raw: string): string {
      let s = raw.trim();
      // Remove markdown code block wrapper if present
      s = s.replace(/^```(?:json)?\s*/i, '');
      s = s.replace(/\s*```\s*$/, '');
      // Find the first {
      const braceStart = s.indexOf('{');
      if (braceStart === -1) return s;
      // Use brace counting to find the matching closing }
      let depth = 0;
      let inString = false;
      let escape = false;
      let braceEnd = -1;
      for (let i = braceStart; i < s.length; i++) {
        const ch = s[i];
        if (escape) { escape = false; continue; }
        if (ch === '\\') { escape = true; continue; }
        if (ch === '"' && !escape) { inString = !inString; continue; }
        if (inString) continue;
        if (ch === '{') depth++;
        if (ch === '}') {
          depth--;
          if (depth === 0) { braceEnd = i; break; }
        }
      }
      if (braceEnd !== -1) {
        s = s.substring(braceStart, braceEnd + 1);
      } else {
        // Incomplete JSON — try to close open structures
        const partial = s.substring(braceStart);
        // Close any open strings
        let cleaned = partial.replace(/"([^"]*?)$/, '"');
        // Count unclosed brackets/braces
        let d = 0, b = 0, arr = 0;
        let instr = false, esc = false;
        for (const ch of cleaned) {
          if (esc) { esc = false; continue; }
          if (ch === '\\') { esc = true; continue; }
          if (ch === '"') instr = !instr;
          if (instr) continue;
          if (ch === '{') d++;
          if (ch === '}') d--;
          if (ch === '[') arr++;
          if (ch === ']') arr--;
        }
        // Close in reverse order
        while (arr > 0) { cleaned += ']'; arr--; }
        while (d > 0) { cleaned += '}'; d--; }
        s = cleaned;
      }
      // Fix common JSON issues from LLM output
      s = s.replace(/\\(?!["\\/bfnrtu])/g, '\\\\');
      s = s.replace(/\t/g, '\\t');
      s = s.replace(/\r/g, '');
      s = s.replace(/,\s*}/g, '}');
      s = s.replace(/,\s*\]/g, ']');
      return s;
    }

    let parsed;

    // Try direct parse, then sanitized parse, then regex extraction
    const tryParse = (text: string): any | null => { try { return JSON.parse(text); } catch { return null; } };

    parsed = tryParse(llmResponse);
    if (!parsed) {
      const sanitized = sanitizeJSON(llmResponse);
      parsed = tryParse(sanitized);
    }
    if (!parsed) {
      // Last resort: find the JSON by looking for "questions": [ pattern
      const qMatch = llmResponse.match(/(\{[\s\S]*"questions"\s*:[\s\S]*\})/);
      if (qMatch) {
        const extracted = sanitizeJSON(qMatch[1]);
        parsed = tryParse(extracted);
      }
    }
    if (!parsed) {
      throw new Error("LLM response was not valid JSON. Response start: " + llmResponse.substring(0, 300));
    }

    const questions = parsed.questions || parsed;
    if (!Array.isArray(questions)) {
      throw new Error("LLM response did not contain a questions array");
    }

    return NextResponse.json({
      success: true,
      questions: questions.map((q: any, idx: number) => ({
        id: `ai-q-${Date.now()}-${idx}`,
        type: q.type || 'MCQ',
        question: q.question || '',
        solution: q.solution || '',
        tags: q.tags || [],
        options: q.options || undefined,
        correctOption: q.correctOption || null,
        assertion: q.assertion || undefined,
        reasoning: q.reasoning || undefined,
        passage: q.passage || undefined,
        subQuestions: q.subQuestions || undefined,
      })),
      count: questions.length,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to extract with AI";
    console.error("[EXTRACT-WITH-LLM] Error:", message);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
