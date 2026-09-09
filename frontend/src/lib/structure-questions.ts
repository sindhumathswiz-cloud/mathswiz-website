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
 * gpt-oss-120b is next — its free tier is only ~8k TPM, which stalls on big
 * documents, so it's second resort. Mistral Large is the last resort, tried
 * only when both of the above have failed.
 *
 * Fallback triggers on TWO distinct failure modes, not just one:
 *  1. The call itself throws (network/auth/timeout/rate-limit) — the
 *     original, obvious case.
 *  2. The call returns HTTP 200 with a string that ISN'T valid JSON after
 *     repair — e.g. Gemini truncates mid-array on a page with a long, dense,
 *     repetitive MCQ list (found live: a 20-item objective-question page
 *     that consistently returned only a partial prefix of items, and a run
 *     of pages that came back completely empty despite having clearly
 *     legible, substantial question text on them). This used to be
 *     silently indistinguishable from "the model legitimately found zero
 *     questions on this page" — parseLLMJson(garbled) and
 *     parseLLMJson('{"questions":[]}') both collapse to the same downstream
 *     `[]`, so a truncated response from Gemini never even reached Groq,
 *     let alone a third provider. Real content was being lost with zero
 *     visibility into why. Fixed by treating "call succeeded but the JSON
 *     doesn't parse" the same as a hard failure for fallback purposes —
 *     only a response that ACTUALLY PARSES (even to a legitimately empty
 *     questions array) is trusted as a real "nothing here" signal and stops
 *     the fallback chain; every other outcome tries the next provider.
 */

function buildPrompt(rawText: string): string {
  return `You are a world-class assistant that extracts math questions from raw OCR'd text into strict JSON.

### OUTPUT
Return ONLY a JSON object: { "questions": [ { "type", "difficulty", "content", "options", "correctAnswer", "explanation", "explanationType", "topic", "method", "tags", "printedNumber" } ] }

### LaTeX RULES
- Wrap every variable, equation, function and fraction in $ (inline) or $$ (display). 'Solve for x' -> 'Solve for $x$'.
- Convert Unicode math (x², √, π) to LaTeX ($x^2$, $\\sqrt{}$, $\\pi$).
- Use DOUBLE BACKSLASHES for LaTeX commands inside JSON strings ("\\\\frac{1}{2}", "\\\\int").
- KaTeX-valid only: wrap any multi-line / aligned derivation (anything using & or line breaks) in $$\\begin{aligned} ... \\end{aligned}$$. NEVER use & or \\\\ outside an aligned/array/cases/matrix/bmatrix environment, or it won't render.

### FIELD RULES
- content: the FULL question stem (prose + math). Never put the solution here. CRITICAL: if the question refers to a matrix, determinant, table, figure, system of equations, or specific values, you MUST include the ACTUAL data verbatim (e.g. the full $\\begin{bmatrix}...\\end{bmatrix}$). NEVER replace it with a vague phrase like "a given matrix A", "the following matrix", or "the matrix shown" — if the data exists in the source text, copy it into content.
- type: classify as ONE of SINGLE_CHOICE, MULTIPLE_CHOICE, INTEGER, TRUE_FALSE, ASSERTION_REASONING, CASE_STUDY, FILL_IN_BLANKS, SHORT_ANSWER, LONG_ANSWER, SUBJECTIVE. Most CBSE board questions are SUBJECTIVE / SHORT_ANSWER / LONG_ANSWER with NO options — do NOT invent options for them. Judge the type from what the question actually demands, not from how many lines of working an answer might take: a question demanding ONE final numeric value (even if solving it takes several steps) is INTEGER, not SHORT/LONG_ANSWER; a question demanding a written proof/derivation/justification is LONG_ANSWER even if short; TRUE_FALSE and FILL_IN_BLANKS only when the source literally poses it that way (a true/false statement, or a blank to fill) — do not force other question shapes into these two.
- difficulty: EASY, MEDIUM, or HARD. Judge by the demand: recall / direct one-step formula / 1-2 mark MCQ = EASY; standard multi-step application / 3 marks = MEDIUM; multi-concept problems, derivations, or "prove/show that" / 4-6 marks = HARD. Do NOT default everything to MEDIUM — assess each question.
- options: array of option texts WITHOUT the "(A)" labels; use [] for non-MCQ.
- correctAnswer: include ONLY if the source provides or clearly states it (an answer key, a "Sol."/"Ans." line, or a marking scheme). If the answer is not present, return "". NEVER guess or solve to fabricate one. For MCQ use the option LETTER; otherwise the answer value.
- explanation: any worked solution / "Detailed Solution" / marking scheme text belonging to this question. Never inside content. If the source gives NO full worked solution but DOES give a "Hint"/"Hints" line for this question, put that hint text here instead -- do not leave it out just because it is not a full solution. If the source gives neither a solution nor a hint, use "".
- explanationType: one of "FULL" (a genuine worked solution / marking scheme), "HINT" (only a hint was given, no full working -- this is what you put in explanation above), or "NONE" (no solution or hint text exists for this question). Must agree with what you put in explanation: "" in explanation always means "NONE" here.
- topic: the single NCERT/CBSE Class 11 or 12 mathematics CHAPTER this question belongs to — e.g. "Integrals", "Matrices", "Determinants", "Application of Derivatives", "Continuity and Differentiability", "Vector Algebra", "Three Dimensional Geometry", "Probability", "Straight Lines", "Conic Sections", "Sequences and Series", "Permutations and Combinations", "Binomial Theorem". Infer this from the mathematical content itself even when the source page has no visible chapter heading (e.g. a question about $\\int$ notation belongs to "Integrals"). Use "" only if you genuinely cannot tell.
- method: the specific named solution technique the question calls for, if there is a distinctly nameable one — e.g. "Integration by substitution", "Integration by parts", "Quotient rule", "Product rule", "Method of Lagrange multipliers", "Cramer's rule", "AM-GM inequality", "Sandwich theorem". Use "" when no single named technique applies (e.g. a plain recall/definition question).
- tags: an array of short labels. ALWAYS capture any exam/source provenance cited near the question — board, paper and year — e.g. "CBSE 2016", "CBSE SQP 2016-17", "CBSE Delhi 2015", "CBSE Comptt 2018", "CBSE Foreign 2015", "NCERT Exemplar", "NDA 2019". Strip the surrounding [ ] brackets and leading codes like "U"/"R&U"/"A". Add "PYQ" when it is a previous-year exam question. Do NOT put the topic or method here — they have their own fields above. Use [] only if nothing applies.
- printedNumber: the book's OWN printed serial number for this question exactly as printed — e.g. "19", "Q.3", "2(a)" — the SAME number you strip from the start of content per the SEGMENTATION rule below. This lets a separate pass match this question to an answer key that lists answers by number on a different page. Use "" if the source shows no visible numbering for this item (e.g. a lettered case-study sub-part with no number of its own).

### SEGMENTATION
- Emit exactly ONE object per distinct QUESTION (usually starting with "Q.N" or a number).
- STRIP the printed exercise/question serial number (e.g. a leading "1.", "19.", "Q1", "Question 1") from the START of content — it's the book's own list numbering, not part of the question, and our own UI numbers questions itself. Capture that same number in printedNumber instead of just discarding it. Do NOT strip a sub-part label like "(i)", "(ii)", "(a)", "(b)" that appears WITHIN a case-study passage — those mark real structure and must stay exactly where they are.
- Use the question number printed before a "Sol."/"Detailed Solution"/marking-scheme block only to MATCH it to its question (see next bullet) — never carry that number into any field's text.
- Attach a "Sol."/"Detailed Solution"/marking-scheme block to ITS question's explanation. If a solution appears in a DIFFERENT section or page from its question, use the question number printed before the solution to match them together. Do NOT create a separate question entry for the solution — it belongs to the matching question's explanation.
- Multiple choice answer keys (e.g. "Ans: 1. (B) 2. (C)") are NOT questions — they belong in the correctAnswer field of their matched question.

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
        const result = await Promise.race([
          model.generateContent(prompt).then(r => r.response.text()),
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error('Gemini request timed out after 60s')), 60000)
          ),
        ]);
        return result;
      } catch (e) {
        lastErr = e;
      }
    }
  }
  throw lastErr ?? new Error('Gemini failed');
}

// FALLBACK: Groq gpt-oss-120b (only if Gemini is unavailable).
async function callGroq(prompt: string): Promise<string> {
  if (!process.env.GROQ_API_KEY) throw new Error('GROQ_API_KEY not set');
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 60000);
  try {
    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
        'Content-Type': 'application/json',
      },
      signal: controller.signal,
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
  } finally {
    clearTimeout(timeout);
  }
}

// LAST RESORT: Mistral Large, tried only after Gemini and Groq have both
// either thrown or returned unparseable JSON.
async function callMistral(prompt: string): Promise<string> {
  if (!process.env.MISTRAL_API_KEY) throw new Error('MISTRAL_API_KEY not set');
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 60000);
  try {
    const response = await fetch('https://api.mistral.ai/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.MISTRAL_API_KEY}`,
        'Content-Type': 'application/json',
      },
      signal: controller.signal,
      body: JSON.stringify({
        model: process.env.QB_MISTRAL_TEXT_MODEL || 'mistral-large-latest',
        messages: [{ role: 'user', content: prompt }],
        response_format: { type: 'json_object' },
        temperature: 0,
      }),
    });
    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(`Mistral error: ${err.error?.message || err.message || response.statusText}`);
    }
    const data = await response.json();
    return data.choices?.[0]?.message?.content ?? '';
  } finally {
    clearTimeout(timeout);
  }
}

const PROVIDERS: Array<{ name: string; call: (prompt: string) => Promise<string> }> = [
  { name: 'gemini', call: callGemini },
  { name: 'groq', call: callGroq },
  { name: 'mistral', call: callMistral },
];

export interface StructureQuestionsOptions {
  /**
   * When the caller KNOWS this page is inside a confirmed questions region (a
   * confirmed chapter-manifest section — not front matter, not an answer-key
   * page), a *parseable-but-empty* result is almost certainly a model error,
   * not a real "no questions here". With this set, an empty parse no longer
   * stops the provider chain — only a non-empty parse or provider exhaustion
   * does. Default (unset) keeps the fast path: a parseable empty result from
   * Gemini is trusted immediately.
   */
  distrustEmpty?: boolean;
}

export async function structureQuestions(rawText: string, opts: StructureQuestionsOptions = {}): Promise<CanonicalQuestion[]> {
  if (!rawText || !rawText.trim()) return [];

  const prompt = buildPrompt(rawText);

  // Diagnostic trail across the loop below: which providers were actually
  // reached and, for each, either "threw: <message>" or a snippet of the
  // unparseable content it returned. Only used if every provider fails --
  // see the throw at the bottom of this function.
  const attempts: string[] = [];

  for (const provider of PROVIDERS) {
    let content: string;
    try {
      content = await provider.call(prompt);
    } catch (e) {
      // Hard failure (network/auth/timeout/no key/rate-limit) -- try the next provider.
      attempts.push(`${provider.name} threw: ${e instanceof Error ? e.message : String(e)}`);
      continue;
    }

    // parseLLMJson repairs LaTeX backslashes; null means unrecoverable, which
    // is deliberately treated as equivalent to a thrown error here (see the
    // fallback-triggers doc comment above) rather than being silently
    // normalized to []  -- try the next provider instead of losing the page.
    const parsed = parseLLMJson(content);
    if (parsed === null) {
      attempts.push(`${provider.name} returned unparseable JSON (${content.length} chars): ${content.slice(0, 300)}`);
      continue;
    }

    // A response that actually parses -- even to a legitimately empty
    // questions array -- is a trustworthy "this provider looked at the page
    // and this is what it found" signal. Stop here rather than burning two
    // more API calls confirming a real "no questions on this page" result.
    const normalized = normalizeExtractedQuestions(parsed);

    // ...unless the caller KNOWS the page has questions (distrustEmpty): a
    // parseable-but-empty result then behaves like unparseable JSON -- fall
    // through to the next provider. Found live on Xam Idea Class 12 p.479
    // (12 questions + a printed key), where Gemini confidently returns
    // {"questions":[]} every time.
    if (opts.distrustEmpty && normalized.length === 0) {
      attempts.push(`${provider.name} returned a parseable but EMPTY result on a page confirmed to contain questions`);
      continue;
    }

    if (provider.name === 'gemini') return normalized;

    // Found live, the first time this fallback chain actually ran end to
    // end: on a dense MCQ page with NO visible answer key or solutions
    // (the key was printed on a different page), the fallback provider
    // still returned a confident correctAnswer for every single question
    // -- and three of them were flatly wrong against the book's real key,
    // found separately. That's not a transcription of something printed on
    // the page; the model solved the questions itself despite the prompt's
    // explicit "NEVER guess or solve to fabricate one" instruction. Gemini
    // has not been observed doing this anywhere in this book. Rather than
    // trust an unverifiable answer/explanation from a fallback provider,
    // strip both here -- content/options/type/topic/printedNumber (which
    // only require transcription, not solving) are kept, since recovering
    // those is the entire point of having a fallback at all. A genuine
    // correctAnswer/explanation printed elsewhere in the chapter still
    // reaches this question later via the match-answer-keys /
    // match-detailed-solutions passes, which only backfill from text that
    // is actually printed near a matching question number -- never solved.
    return normalized.map((q) => ({
      ...q,
      correctAnswer: '',
      explanation: '',
      explanationType: 'NONE',
      tags: [...q.tags, `Extracted via ${provider.name} fallback -- answer/explanation stripped, unverified`],
    }));
  }

  // Every provider either failed outright or returned unparseable JSON on
  // this page. Previously this silently returned [] here, which is
  // indistinguishable from a page that genuinely has zero questions -- that
  // silence is exactly what hid the original truncation/empty-run bug from
  // view. Now that Gemini/Groq/Mistral have ALL been tried and none could
  // produce usable structured output, throw instead: the caller
  // (extract-book-page.ts -> extract-questions/route.ts) records a thrown
  // error into the batch's failures[] array, so a genuinely-stuck page shows
  // up as a visible failure to investigate rather than a quiet "0 detected"
  // that looks identical to a real empty page.
  throw new Error(
    `structureQuestions: all ${PROVIDERS.length} providers failed to produce usable JSON for this page. ` +
    attempts.map((a, i) => `[${i + 1}] ${a}`).join(' | ')
  );
}
