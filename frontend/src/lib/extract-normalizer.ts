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

/**
 * What kind of solution guidance `explanation` actually holds:
 *  - FULL: a genuine worked solution / detailed answer.
 *  - HINT: the source gave only a hint (no full working) -- `explanation`
 *    holds that hint text instead, so it isn't lost, but downstream code
 *    must not present it as a complete solution.
 *  - NONE: no solution or hint text at all; `explanation` is "".
 */
export type ExplanationType = 'FULL' | 'HINT' | 'NONE';
const VALID_EXPLANATION_TYPE = new Set<ExplanationType>(['FULL', 'HINT', 'NONE']);

export interface CanonicalQuestion {
  questionContent: string;
  type: CanonicalType;
  difficulty: Difficulty;
  options: string[];
  correctAnswer: string;
  explanation: string;
  /**
   * Classifies what `explanation` actually contains -- see ExplanationType.
   * Lets downstream code (tagging DRAFT questions as "Questions without
   * Solutions", "Hint Available") distinguish a real worked solution from a
   * mere hint or nothing at all, instead of only checking for a non-empty
   * string.
   */
  explanationType: ExplanationType;
  tags: string[];
  /** Chapter/topic this question belongs to, e.g. "Integrals" — raw LLM guess, not yet snapped to a canonical name. */
  topic: string;
  /** Named solution technique, if the question calls for one, e.g. "Integration by substitution". */
  method: string;
  /**
   * The book's own printed serial number for this question (e.g. "19",
   * "Q.3", "2(a)") — the SAME number stripped from the front of
   * questionContent by stripLeadingQuestionNumber. Captured separately
   * (rather than only discarded) so a later pass can match a
   * question to an answer-key page that lists answers by number, printed
   * pages away from the question itself. "" when the source has no visible
   * numbering (e.g. an individual case-study sub-part).
   */
  printedNumber: string;
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
const TOPIC_KEYS = ['topic', 'chapter', 'topicName', 'chapterName'];
const METHOD_KEYS = ['method', 'solutionMethod', 'approach', 'technique'];
const PRINTED_NUMBER_KEYS = ['printedNumber', 'number', 'serialNumber', 'qNumber', 'questionNumber'];
const EXPLANATION_TYPE_KEYS = ['explanationType', 'solutionType', 'answerType'];

// Matches explanation text that IS a hint rather than a full worked solution,
// when the model captured the text but didn't (or couldn't) set
// explanationType itself -- e.g. "Hint: use the sandwich theorem.".
const HINT_TEXT_RE = /^\s*hints?\b\s*[:.\-]?/i;

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

/**
 * Strip the book's own printed exercise/question serial number — "1. ",
 * "19. ", "Q1.", "Question 1 " — from the very start of a question's content.
 * Defense-in-depth alongside the prompt instruction above: catches it even
 * when the model doesn't comply, and covers every entry point into this
 * normalizer (both extraction routes share it).
 *
 * Anchored to the start only, so a case-study passage's own "(i)"/"(ii)"
 * sub-part labels further into the text are never touched — only the single
 * outer serial number the printed book put in front of the whole item.
 * Requires whitespace after the number/punctuation, so a genuine decimal
 * like "2.5" (no space before the next character) never matches.
 */
function stripLeadingQuestionNumber(text: string): string {
  return text.replace(/^\s*(?:Q(?:uestion)?[\s.]*)?\(?\d{1,3}\)?[.)]\s+/i, '').trim();
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

/**
 * Determine the ExplanationType for a question, given the model's own
 * (optional, unreliable) explanationType field and the already-normalized
 * explanation text.
 *
 * Conservative by construction: explanation text is the source of truth, not
 * the model's classification, so a model that mislabels a real solution as a
 * "HINT" (or vice versa) can't cause the wrong text to be discarded --
 * normalizeExtractedQuestion always keeps whatever text firstString(...)
 * found in `explanation` regardless of this classification.
 *  - No explanation text at all -> NONE, no matter what the model claimed.
 *  - Explanation text present and starts with "Hint"/"Hints" -> HINT, even if
 *    the model didn't say so (or said FULL) -- the text itself is the
 *    stronger signal.
 *  - Explanation text present and the model gave a valid, non-NONE type ->
 *    trust it (lets the model call out a HINT that doesn't start with the
 *    word "Hint").
 *  - Otherwise, explanation text present with no usable signal -> FULL (the
 *    pre-existing behavior: any captured explanation text was treated as a
 *    real solution).
 */
export function normalizeExplanationType(obj: Record<string, unknown>, explanation: string): ExplanationType {
  if (!explanation.trim()) return 'NONE';
  if (HINT_TEXT_RE.test(explanation)) return 'HINT';

  const raw = String(obj.explanationType ?? firstString(obj, EXPLANATION_TYPE_KEYS)).toUpperCase();
  if (VALID_EXPLANATION_TYPE.has(raw as ExplanationType) && raw !== 'NONE') return raw as ExplanationType;

  return 'FULL';
}

/** Normalize one raw object into the canonical schema. */
export function normalizeExtractedQuestion(raw: unknown): CanonicalQuestion {
  const obj = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const options = normalizeOptions(obj);
  const questionContent = stripLeadingQuestionNumber(firstString(obj, QUESTION_KEYS));
  const explanation = firstString(obj, EXPLANATION_KEYS);

  // Prefer a valid explicit type from the model; otherwise derive it.
  const rawType = String(obj.type ?? '').toUpperCase() as CanonicalType;
  const type = VALID_TYPES.has(rawType) ? rawType : classifyType(questionContent, options);

  return {
    questionContent,
    type,
    difficulty: normalizeDifficulty(obj.difficulty),
    options,
    correctAnswer: normalizeAnswer(firstString(obj, ANSWER_KEYS), options),
    explanation,
    explanationType: normalizeExplanationType(obj, explanation),
    tags: normalizeTags(obj),
    topic: firstString(obj, TOPIC_KEYS),
    method: firstString(obj, METHOD_KEYS),
    printedNumber: firstString(obj, PRINTED_NUMBER_KEYS),
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
