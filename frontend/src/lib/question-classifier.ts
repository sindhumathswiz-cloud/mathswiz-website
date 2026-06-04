import { fetchFromLLM } from "./llm";

const CLASSIFIER_PROMPT = `You are a math question classifier. Given a question, determine its type and difficulty.

Rules for type classification:
- SINGLE_CHOICE: Question has 2+ labeled options (A, B, C, D) and exactly one is correct
- MULTIPLE_CHOICE: Question has 2+ options and MORE THAN ONE could be correct
- INTEGER: Asks for a single numeric answer (e.g. "Find the value of x")
- TRUE_FALSE: Statement that requires True/False or Yes/No judgement
- SUBJECTIVE: Requires a written explanation, proof, or derivation (no options)
- FILL_IN_BLANKS: Contains blank(s) to fill (e.g. "___", "______", "_____")
- ASSERTION_REASONING: Two statements labeled Assertion (A) and Reason (R)
- CASE_STUDY: A passage with multiple sub-questions
- VERY_SHORT_ANSWER: Expects a 1-2 word answer (e.g. "Name the...", "Define...")
- SHORT_ANSWER: Expects a 2-3 sentence answer
- LONG_ANSWER: Expects a multi-paragraph answer or proof

Rules for difficulty:
- EASY: Basic recall, single-step, straightforward calculation
- MEDIUM: Requires multiple steps, moderate problem-solving
- HARD: Complex multi-step, advanced concepts, non-trivial reasoning

Respond with valid JSON only:
{
  "type": "SINGLE_CHOICE",
  "difficulty": "MEDIUM",
  "reasoning": "Brief justification"
}`;

export interface ClassificationResult {
  type: string;
  difficulty: string;
  reasoning: string;
}

function classifyByHeuristics(question: string, options?: string[]): ClassificationResult | null {
  if (!question) return null;

  const hasOptions = options && options.length >= 2 && options.some(o => o.trim().length > 0);

  if (hasOptions) {
    const multipleIndicator = /(?:select|choose|pick|which).*(?:all|multiple|more than one|both|two|three)/i;
    const isMultiple = multipleIndicator.test(question);
    const isAssertion = /assertion.*reason|reason.*assertion/i.test(question);
    if (isAssertion) return { type: 'ASSERTION_REASONING', difficulty: 'MEDIUM', reasoning: 'Has assertion-reasoning format with options' };
    if (isMultiple) return { type: 'MULTIPLE_CHOICE', difficulty: 'MEDIUM', reasoning: 'Has multiple options and indicates multiple correct answers' };
    if (options!.length >= 6) return { type: 'MULTIPLE_CHOICE', difficulty: 'MEDIUM', reasoning: 'Has 6+ options, likely multiple correct' };
    return { type: 'SINGLE_CHOICE', difficulty: 'MEDIUM', reasoning: 'Has labeled options with a single correct answer' };
  }

  if (/true|false|yes|no|correct|incorrect/i.test(question) && question.length < 200) {
    return { type: 'TRUE_FALSE', difficulty: 'EASY', reasoning: 'Short statement asking for true/false judgement' };
  }

  if (/_{2,}|_{10,}|_{4,}|_{3,}|fill\s*(?:in|up)|blank/i.test(question)) {
    return { type: 'FILL_IN_BLANKS', difficulty: 'MEDIUM', reasoning: 'Contains blank fill-in pattern' };
  }

  if (/name\s+(?:the|any|a|an)|define|list|state|what\s+is|who\s+is/i.test(question) && question.length < 100) {
    return { type: 'VERY_SHORT_ANSWER', difficulty: 'EASY', reasoning: 'Short name/define/list question' };
  }

  if (/prove|derive|show\s+that|verify|demonstrate/i.test(question)) {
    return { type: 'LONG_ANSWER', difficulty: 'HARD', reasoning: 'Requires proof or derivation' };
  }

  if (/explain|describe|elaborate|discuss|compare|contrast|differentiate/i.test(question) && question.length > 100) {
    return { type: 'LONG_ANSWER', difficulty: 'MEDIUM', reasoning: 'Requires detailed explanation' };
  }

  if (/explain|describe|elaborate|discuss|compare|contrast|differentiate|find\s+the|calculate|evaluate|solve|determine|compute/i.test(question)) {
    if (question.length > 150) return { type: 'SHORT_ANSWER', difficulty: 'MEDIUM', reasoning: 'Requires explanation or calculation' };
    return /find\s+the\s+value|evaluate|calculate|compute|determine(?:\s+the\s+value)?/i.test(question)
      ? { type: 'INTEGER', difficulty: 'MEDIUM', reasoning: 'Asks for a numeric value' }
      : { type: 'SHORT_ANSWER', difficulty: 'MEDIUM', reasoning: 'Requires a short answer' };
  }

  if (/passage|paragraph|case\s+study|read\s+the\s+(?:following|above)/i.test(question)) {
    return { type: 'CASE_STUDY', difficulty: 'HARD', reasoning: 'Contains passage with sub-questions' };
  }

  return null;
}

export async function classifyQuestion(
  question: string,
  options?: string[]
): Promise<ClassificationResult> {
  const heuristic = classifyByHeuristics(question, options);
  if (heuristic && heuristic.type) {
    if (options && options.length >= 2 && options.some(o => o.trim())) {
      const hasLetters = options.every(o => /^[A-Da-d][\.\)\s]/.test(o.trim()));
      if (hasLetters && heuristic.type === 'SINGLE_CHOICE') return heuristic;
    }
    if (heuristic.type !== 'SINGLE_CHOICE' && heuristic.type !== 'SUBJECTIVE') {
      return heuristic;
    }
  }

  try {
    const response = await fetchFromLLM(
      CLASSIFIER_PROMPT,
      `Question: ${question}\nOptions: ${JSON.stringify(options || [])}\n\nClassify this question.`
    );
    const cleaned = response.replace(/```(?:json)?\s*/gi, '').trim();
    const parsed = JSON.parse(cleaned);
    if (parsed.type && parsed.difficulty) {
      return { type: parsed.type, difficulty: parsed.difficulty, reasoning: parsed.reasoning || '' };
    }
  } catch {
    // Fall through to heuristic result
  }

  return heuristic || { type: 'SINGLE_CHOICE', difficulty: 'MEDIUM', reasoning: 'Default fallback' };
}

export function computeContentHash(text: string): string {
  const normalized = text
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/[\$\\{}]/g, '')
    .replace(/[^\w\s]/g, '')
    .trim();
  let hash = 0;
  for (let i = 0; i < normalized.length; i++) {
    const char = normalized.charCodeAt(i);
    hash = ((hash << 5) - hash + char) | 0;
  }
  return hash.toString(36);
}
