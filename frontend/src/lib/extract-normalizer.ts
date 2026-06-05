/**
 * Normalizes loosely-structured question objects returned by an LLM into the
 * canonical schema the UI consumes (questionContent / options / correctAnswer /
 * explanation / tags).
 *
 * Root cause this addresses: the extraction LLM does not reliably use our field
 * names. The client previously read `q.questionContent` with `if (q.x)` guards,
 * so when the model returned `content` / `answer` / `solution` the fields were
 * silently dropped — surfacing as "question parsed but answer not", an equation
 * appearing as the question, etc. Mapping aliases here makes the contract robust
 * regardless of which synonym the model picks.
 */

/** Canonical question types — must match the Prisma `QuestionType` enum. */
export type CanonicalType =
  | 'SINGLE_CHOICE'
  | 'MULTIPLE_CHOICE'
  | 'INTEGER'
  | 'TRUE_FALSE'
  | 'SUBJECTIVE'
  | 'FILL_IN_BLANKS'
  | 'ASSERTION_REASONING'
  | 'CASE_STUDY'
  | 'VERY_SHORT_ANSWER'
  | 'SHORT_ANSWER'
  | 'LONG_ANSWER';

const VALID_TYPES = new Set<CanonicalType>([
  'SINGLE_CHOICE', 'MULTIPLE_CHOICE', 'INTEGER', 'TRUE_FALSE', 'SUBJECTIVE',
  'FILL_IN_BLANKS', 'ASSERTION_REASONING', 'CASE_STUDY', 'VERY_SHORT_ANSWER',
  'SHORT_ANSWER', 'LONG_ANSWER',
]);

export type Difficulty = 'EASY' | 'MEDIUM' | 'HARD';
const VALID_DIFFICULTY = new Set<Difficulty>(['EASY', 'MEDIUM', 'HARD']);

export interface CanonicalQuestion {
  questionContent: string;
  type: CanonicalType;
  difficulty: Difficulty;
  options: string[];
  correctAnswer: string;
  explanation: string;
  tags: string[];
}

/** Normalize a difficulty value to the enum, defaulting to MEDIUM. */
export function normalizeDifficulty(raw: unknown): Difficulty {
  const d = String(raw ?? '').toUpperCase();
  return VALID_DIFFICULTY.has(d as Difficulty) ? (d as Difficulty) : 'MEDIUM';
}

/**
 * Derive the question type from its content + options. CBSE textbooks are mostly
 * subjective (Short/Long Answer), so we must NOT default everything to MCQ —
 * that was the bug where subjective questions were saved as choice questions
 * with empty options.
 */
export function classifyType(questionContent: string, options: string[]): CanonicalType {
  const q = questionContent.toLowerCase();
  if (/assertion|reason\s*\(r\)/.test(q)) return 'ASSERTION_REASONING';
  if (/case study|read the (following|passage)|based on the (above|passage)/.test(q)) return 'CASE_STUDY';
  if (/true or false|state whether.*true/.test(q)) return 'TRUE_FALSE';
  if (/fill in the blank|_{3,}|\\rule|\\underline/.test(q)) return 'FILL_IN_BLANKS';
  if (options.length >= 2) return 'SINGLE_CHOICE';
  // No options: numeric-only answer => INTEGER, long prose prompts => LONG/SHORT.
  if (/prove|show that|derive|explain|describe|justify/.test(q)) return 'LONG_ANSWER';
  return 'SUBJECTIVE';
}

const QUESTION_KEYS = ['questionContent', 'content', 'question', 'questionText', 'stem', 'problem', 'text'];
const ANSWER_KEYS = ['correctAnswer', 'correctOption', 'correct', 'answer', 'ans', 'correct_answer', 'correct_option'];
const EXPLANATION_KEYS = ['explanation', 'solution', 'sol', 'working', 'steps', 'reasoning'];
const OPTION_KEYS = ['options', 'choices', 'opts'];
const TAG_KEYS = ['tags', 'topics', 'labels'];

function firstString(obj: Record<string, unknown>, keys: string[]): string {
  for (const k of keys) {
    const v = obj[k];
    if (typeof v === 'string' && v.trim()) return v.trim();
    if (typeof v === 'number') return String(v);
  }
  return '';
}

/** Strip a leading option label like "(a)", "A.", "b)" so it isn't duplicated next to the UI's own A/B/C/D badge. */
function stripOptionLabel(text: string): string {
  return text.replace(/^\s*\(?([A-Da-d])\)?[.):]\s+/, '').trim();
}

function normalizeOptions(obj: Record<string, unknown>): string[] {
  let raw: unknown;
  for (const k of OPTION_KEYS) {
    if (obj[k] != null) { raw = obj[k]; break; }
  }
  if (!Array.isArray(raw)) return [];
  return raw
    .map((opt) => {
      if (typeof opt === 'string') return stripOptionLabel(opt);
      if (opt && typeof opt === 'object') {
        const o = opt as Record<string, unknown>;
        const t = o.text ?? o.value ?? o.label ?? '';
        return stripOptionLabel(String(t));
      }
      return '';
    })
    .filter((s) => s.length > 0);
}

function normalizeTags(obj: Record<string, unknown>): string[] {
  for (const k of TAG_KEYS) {
    const v = obj[k];
    if (Array.isArray(v)) return v.map((t) => String(t).trim()).filter(Boolean);
    if (typeof v === 'string' && v.trim()) return v.split(',').map((t) => t.trim()).filter(Boolean);
  }
  return [];
}

/** Loose equality for matching an answer's text against an option's text. */
function loosen(s: string): string {
  return s.toLowerCase().replace(/[\s$\\{}]/g, '');
}

/**
 * For MCQs, coerce the answer into an option LETTER when possible:
 *  - already a bare letter ("b")            -> "B"
 *  - wrapped letter ("(C)", "B)")           -> "B"
 *  - full option text matching an option    -> that option's letter
 * Otherwise (integer/subjective answers, or no match) keep the trimmed value.
 * Never invents an answer: empty input stays empty.
 */
function normalizeAnswer(rawAnswer: string, options: string[]): string {
  const a = rawAnswer.trim();
  if (!a) return '';

  if (options.length > 0) {
    const bare = a.match(/^\(?([A-Da-d])\)?[.):]?$/);
    if (bare) return bare[1].toUpperCase();

    const idx = options.findIndex((opt) => loosen(opt) === loosen(a));
    if (idx >= 0) return String.fromCharCode(65 + idx);
  }
  return a;
}

/** Normalize one raw object into the canonical schema. */
export function normalizeExtractedQuestion(raw: unknown): CanonicalQuestion {
  const obj = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const options = normalizeOptions(obj);
  const questionContent = firstString(obj, QUESTION_KEYS);

  // Prefer a valid explicit type from the model; otherwise derive it.
  const rawType = String(obj.type ?? '').toUpperCase() as CanonicalType;
  const type = VALID_TYPES.has(rawType) ? rawType : classifyType(questionContent, options);

  return {
    questionContent,
    type,
    difficulty: normalizeDifficulty(obj.difficulty),
    options,
    correctAnswer: normalizeAnswer(firstString(obj, ANSWER_KEYS), options),
    explanation: firstString(obj, EXPLANATION_KEYS),
    tags: normalizeTags(obj),
  };
}

/** Count natural-language words (2+ letters), ignoring bare math variables like `x`. */
function countWords(s: string): number {
  return (s.match(/[A-Za-z]{2,}/g) || []).length;
}

/**
 * A canonical question is usable only if it has actual options, or a stem that
 * reads like a question (a question mark or at least two real words). A bare
 * equation such as `$x=5$` has neither, so an answer/equation fragment won't be
 * mistaken for the question.
 */
function isUsable(q: CanonicalQuestion): boolean {
  if (q.options.length >= 2) return true;
  if (q.questionContent.includes('?')) return true;
  return countWords(q.questionContent) >= 2;
}

/**
 * Accepts whatever the LLM returned — a bare array, a `{ questions: [...] }`
 * wrapper, or a single object — and returns only usable canonical questions.
 * Filtering out fragments prevents an answer-only or equation-only object from
 * being mistaken for the question (the "data[0] grabbed the wrong thing" bug).
 */
export function normalizeExtractedQuestions(raw: unknown): CanonicalQuestion[] {
  let list: unknown[];
  if (Array.isArray(raw)) {
    list = raw;
  } else if (raw && typeof raw === 'object' && Array.isArray((raw as Record<string, unknown>).questions)) {
    list = (raw as Record<string, unknown>).questions as unknown[];
  } else if (raw && typeof raw === 'object') {
    list = [raw];
  } else {
    list = [];
  }
  return list.map(normalizeExtractedQuestion).filter(isUsable);
}
