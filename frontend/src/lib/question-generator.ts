import { GoogleGenerativeAI } from "@google/generative-ai";
import { parseLLMJson } from "./llm-json";
import { normalizeExtractedQuestions, type CanonicalQuestion } from "./extract-normalizer";

const GEMINI_MODELS = ["gemini-3.5-flash", "gemini-2.5-flash"];

function geminiKeys(): string[] {
  return [
    process.env.GEMINI_API_KEY,
    process.env.GEMINI_API_KEY_1,
    process.env.GEMINI_API_KEY_2,
    process.env.GEMINI_API_KEY_3,
  ].filter(Boolean) as string[];
}

async function callGemini(prompt: string): Promise<string> {
  const keys = geminiKeys();
  if (keys.length === 0) throw new Error("No GEMINI_API_KEY configured");
  let lastErr: unknown;
  for (const modelName of GEMINI_MODELS) {
    for (const key of keys) {
      try {
        const genAI = new GoogleGenerativeAI(key);
        const model = genAI.getGenerativeModel({
          model: modelName,
          generationConfig: { responseMimeType: "application/json", temperature: 0.7 },
        });
        const result = await model.generateContent(prompt);
        return result.response.text();
      } catch (e) {
        lastErr = e;
      }
    }
  }
  throw lastErr ?? new Error("Gemini failed");
}

async function callGroq(prompt: string): Promise<string> {
  if (!process.env.GROQ_API_KEY) throw new Error("GROQ_API_KEY not set");
  const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "openai/gpt-oss-120b",
      messages: [{ role: "user", content: prompt }],
      response_format: { type: "json_object" },
      temperature: 0.7,
    }),
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(`Groq error: ${err.error?.message || response.statusText}`);
  }
  const data = await response.json();
  return data.choices?.[0]?.message?.content ?? "";
}

export interface GenerateOptions {
  board: string;
  className: string;
  subject: string;
  topicName: string;
  subtopics: string[];
  count: number;
  referenceText?: string; // Optional NCERT/excerpt context
}

/**
 * Generates original questions for a given topic using AI, adapting from
 * source material and existing question examples to ensure syllabus alignment.
 */
export async function generateQuestions(
  options: GenerateOptions,
): Promise<CanonicalQuestion[]> {
  const { board, className, subject, topicName, subtopics, count, referenceText } = options;

  const prompt = `You are a mathematics question generator for ${board} ${className} ${subject}.

Topic: ${topicName}
Subtopics: ${subtopics.join(", ")}

${referenceText ? `Reference material (adapt questions from this, changing numbers/values and rephrasing):\n${referenceText.substring(0, 8000)}\n` : ""}

Generate EXACTLY ${count} original exam-quality questions with complete step-by-step solutions.

Requirements:
- Questions must be DIRECTLY based on the topic and subtopics listed above
- Adapt from any provided reference material — change numbers, values, and phrasing to create original questions
- Cover a mix of difficulty levels: EASY (recall/direct formula), MEDIUM (multi-step), HARD (complex/proof)
- Cover a mix of types: SINGLE_CHOICE, ASSERTION_REASONING, INTEGER, SHORT_ANSWER, LONG_ANSWER, SUBJECTIVE
- For MCQ: exactly 4 options (A, B, C, D) with one correct answer
- For ASSERTION_REASONING: include assertion + reasoning + 4 standard options
- For INTEGER: expect a numeric answer
- For subjective types: provide full step-by-step solution in explanation
- Every question MUST have a complete solution in the "explanation" field
- Format LaTeX with $...$ (inline) and $$...$$ (display). Use DOUBLE backslashes in JSON strings.
- Tag each question with the subtopic name and "${board}", "${className}"

Return ONLY valid JSON: { "questions": [ { "type", "difficulty", "content", "options", "correctAnswer", "explanation", "tags" } ] }`;

  let content: string | null = null;

  try {
    content = await callGemini(prompt);
  } catch {
    try {
      content = await callGroq(prompt);
    } catch {
      content = null;
    }
  }

  const parsed = parseLLMJson(content);
  const normalized = normalizeExtractedQuestions(parsed);

  // Attach generation metadata tags
  for (const q of normalized) {
    q.tags = [...new Set([...(q.tags || []), "AUTO-GENERATED", board, className, topicName])];
  }

  return normalized;
}
