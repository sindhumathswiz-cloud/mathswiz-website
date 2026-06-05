import { GoogleGenerativeAI } from '@google/generative-ai';
import { parseLLMJson } from './llm-json';
import { normalizeExtractedQuestions, type CanonicalQuestion } from './extract-normalizer';

/**
 * Structure raw OCR'd text (Mathpix markdown or page text) into canonical
 * questions. Shared by the image route (extract-mathpix) and the textbook PDF
 * route (extract-pdf): one hardened implementation — strict schema,
 * never-fabricate answers, correct typing, LaTeX-safe JSON parsing, normalization.
 *
 * Provider order: Gemini 3.5 Flash first (current model, free tier with large
 * per-minute headroom, so bulk textbook ingestion isn't throttled). Groq
 * gpt-oss-120b is the fallback — its free tier is only ~8k TPM, which stalls on
 * big documents, so it's last resort only.
 */

function buildPrompt(rawText: string): string {
  return `You are a world-class assistant that extracts math questions from raw OCR'd text into strict JSON.

### OUTPUT
Return ONLY a JSON object: { "questions": [ { "type", "difficulty", "content", "options", "correctAnswer", "explanation", "tags" } ] }

### LaTeX RULES
- Wrap every variable, equation, function and fraction in $ (inline) or $$ (display). 'Solve for x' -> 'Solve for $x$'.
- Convert Unicode math (x², √, π) to LaTeX ($x^2$, $\\sqrt{}$, $\\pi$).
- Use DOUBLE BACKSLASHES for LaTeX commands inside JSON strings ("\\\\frac{1}{2}", "\\\\int").
- KaTeX-valid only: wrap any multi-line / aligned derivation (anything using & or line breaks) in $$\\begin{aligned} ... \\end{aligned}$$. NEVER use & or \\\\ outside an aligned/array/cases/matrix/bmatrix environment, or it won't render.

### FIELD RULES
- content: the FULL question stem (prose + math). Never put the solution here. CRITICAL: if the question refers to a matrix, determinant, table, figure, system of equations, or specific values, you MUST include the ACTUAL data verbatim (e.g. the full $\\begin{bmatrix}...\\end{bmatrix}$). NEVER replace it with a vague phrase like "a given matrix A", "the following matrix", or "the matrix shown" — if the data exists in the source text, copy it into content.
- type: classify as ONE of SINGLE_CHOICE, MULTIPLE_CHOICE, INTEGER, TRUE_FALSE, ASSERTION_REASONING, CASE_STUDY, FILL_IN_BLANKS, SHORT_ANSWER, LONG_ANSWER, SUBJECTIVE. Most CBSE board questions are SUBJECTIVE / SHORT_ANSWER / LONG_ANSWER with NO options — do NOT invent options for them.
- difficulty: EASY, MEDIUM, or HARD. Judge by the demand: recall / direct one-step formula / 1-2 mark MCQ = EASY; standard multi-step application / 3 marks = MEDIUM; multi-concept problems, derivations, or "prove/show that" / 4-6 marks = HARD. Do NOT default everything to MEDIUM — assess each question.
- options: array of option texts WITHOUT the "(A)" labels; use [] for non-MCQ.
- correctAnswer: include ONLY if the source provides or clearly states it (an answer key, a "Sol."/"Ans." line, or a marking scheme). If the answer is not present, return "". NEVER guess or solve to fabricate one. For MCQ use the option LETTER; otherwise the answer value.
- explanation: any worked solution / "Detailed Solution" / marking scheme text belonging to this question. Never inside content.
- tags: an array of short labels. ALWAYS capture any exam/source provenance cited near the question — board, paper and year — e.g. "CBSE 2016", "CBSE SQP 2016-17", "CBSE Delhi 2015", "CBSE Comptt 2018", "CBSE Foreign 2015", "NCERT Exemplar", "NDA 2019". Strip the surrounding [ ] brackets and leading codes like "U"/"R&U"/"A". Add "PYQ" when it is a previous-year exam question. You may also add 1-2 topic keywords. Use [] only if nothing applies.

### SEGMENTATION
- Emit exactly ONE object per distinct QUESTION (usually starting with "Q.N" or a number).
- Attach a "Sol."/"Detailed Solution"/marking-scheme block to ITS question's explanation. Do NOT emit a solution, a lone equation, or an option as its own question.

### INPUT TEXT
${rawText}
`;
}

function geminiKeys(): string[] {
  return [
    process.env.GEMINI_API_KEY,
    process.env.GEMINI_API_KEY_1,
    process.env.GEMINI_API_KEY_2,
    process.env.GEMINI_API_KEY_3,
  ].filter(Boolean) as string[];
}

// Reject if a single model call takes too long, so a hung request fails that
// chunk instead of stalling the whole document.
const CALL_TIMEOUT_MS = 120_000;
function withTimeout<T>(p: Promise<T>, ms = CALL_TIMEOUT_MS): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error('LLM call timed out')), ms)),
  ]);
}

// Newest GA flash first; fall back to the prior GA flash if a key/model is busy.
const GEMINI_MODELS = ['gemini-3.5-flash', 'gemini-2.5-flash'];

// PRIMARY: Gemini 3.5 Flash with model + key rotation (large free-tier quota).
async function callGemini(prompt: string): Promise<string> {
  const keys = geminiKeys();
  if (keys.length === 0) throw new Error('No GEMINI_API_KEY configured');
  let lastErr: unknown;
  for (const modelName of GEMINI_MODELS) {
    for (const key of keys) {
      try {
        const genAI = new GoogleGenerativeAI(key);
        const model = genAI.getGenerativeModel({
          model: modelName,
          generationConfig: { responseMimeType: 'application/json', temperature: 0 },
        });
        const result = await withTimeout(model.generateContent(prompt));
        return result.response.text();
      } catch (e) {
        lastErr = e; // model unavailable or per-key rate limit — try next key/model
      }
    }
  }
  throw lastErr ?? new Error('Gemini failed');
}

// FALLBACK: Groq gpt-oss-120b (only if Gemini is unavailable).
async function callGroq(prompt: string): Promise<string> {
  if (!process.env.GROQ_API_KEY) throw new Error('GROQ_API_KEY not set');
  const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'openai/gpt-oss-120b',
      messages: [{ role: 'user', content: prompt }],
      response_format: { type: 'json_object' },
      temperature: 0,
    }),
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(`Groq error: ${err.error?.message || response.statusText}`);
  }
  const data = await response.json();
  return data.choices?.[0]?.message?.content ?? '';
}

export async function structureQuestions(rawText: string): Promise<CanonicalQuestion[]> {
  if (!rawText || !rawText.trim()) return [];

  const prompt = buildPrompt(rawText);
  let content: string | null = null;

  try {
    content = await callGemini(prompt);
  } catch {
    // Gemini unavailable → last-resort Groq.
    try {
      content = await callGroq(prompt);
    } catch {
      content = null;
    }
  }

  // parseLLMJson repairs LaTeX backslashes; null (unrecoverable) -> [] so one
  // bad chunk doesn't abort the whole document.
  return normalizeExtractedQuestions(parseLLMJson(content));
}
