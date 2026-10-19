import { parseLLMJson } from '@/lib/llm-json';
import { parseQuestionOptions, resolveCorrectOptionIndex } from '@/lib/arena-answer';
import { fieldRenders, repairLatexField } from '@/lib/latex-repair';

/**
 * Drafting a missing worked solution (and, for objective questions, an answer) with models, under rules
 * meant to keep a wrong answer from looking right:
 *
 *  - an objective answer is accepted only when two different models, each solving the problem on its own,
 *    arrive at the same answer (a multiple-choice answer must also be one of the options);
 *  - a solution for a question that already has an answer is accepted only if it ends at that answer;
 *  - anything that cannot be checked this way is still drafted, but labelled as a single-model draft;
 *  - nothing is ever overwritten, and nothing is approved: a draft is a starting point for a reviewer.
 */

export const MCQ_TYPES = new Set(['SINGLE_CHOICE', 'MULTIPLE_CHOICE']);
export const OBJECTIVE_TYPES = new Set(['SINGLE_CHOICE', 'MULTIPLE_CHOICE', 'INTEGER', 'TRUE_FALSE']);

export interface DraftQuestion {
  type: string;
  content: string;
  options: unknown;
  correctAnswer: string | null;
  explanation: string | null;
}

export function solverPrompts(q: DraftQuestion, { withSolution }: { withSolution: boolean }): { system: string; user: string } {
  const options = parseQuestionOptions(q.options);
  const mcq = MCQ_TYPES.has(q.type) && options.length >= 2;
  const answerRule = mcq
    ? 'final_answer must be the letter of the correct option (A, B, C or D).'
    : q.type === 'INTEGER'
      ? 'final_answer must be a single number written plainly (for example 12 or -3.5), with no units or words.'
      : q.type === 'TRUE_FALSE'
        ? 'final_answer must be exactly "True" or "False".'
        : 'final_answer must be the final result only, in LaTeX where needed, with no working.';
  const system = [
    'You are a careful mathematics teacher solving a question for a textbook answer key.',
    'Solve it yourself, step by step, and check your result before answering.',
    'If the question cannot be answered from what is written (a figure, table or data is missing), set final_answer to "UNANSWERABLE".',
    answerRule.replace('final_answer', 'FINAL_ANSWER'),
    withSolution
      ? 'The solution must be a clear worked solution for a student, under 250 words, using $...$ for inline mathematics and $$...$$ on its own lines for display mathematics. Do not mention being an AI.'
      : 'Do not write a solution; leave the SOLUTION section empty.',
    'Reply in exactly this format and nothing else (plain text, not JSON):',
    'FINAL_ANSWER: <the answer on one line>',
    'SOLUTION:',
    '<the worked solution>',
  ].join('\n');
  const user = [`Question type: ${q.type}`, `Question:\n${q.content}`, mcq ? `Options:\n${options.map((o, i) => `${String.fromCharCode(65 + i)}. ${o}`).join('\n')}` : ''].filter(Boolean).join('\n\n');
  return { system, user };
}

export interface SolverReply { finalAnswer: string; solution: string }

/** Math written \( ... \) or \[ ... \] becomes the $ ... $ and $$ ... $$ the rest of the question bank uses. */
export function normaliseMathDelimiters(text: string): string {
  return text
    .replace(/\\\[([\s\S]*?)\\\]/g, (_m, inner: string) => '\n$$\n' + inner.trim() + '\n$$\n')
    .replace(/\\\(([\s\S]*?)\\\)/g, (_m, inner: string) => '$' + inner.trim() + '$')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * Reads a model's reply. The tagged plain-text format ("FINAL_ANSWER: ... SOLUTION: ...") is what is asked
 * for, because LaTeX inside a JSON string keeps breaking the JSON; JSON is still accepted.
 */
export function parseSolverReply(raw: string | null | undefined): SolverReply | null {
  const text = (raw ?? '').replace(/^```[a-z]*\s*|\s*```$/gi, '').trim();
  if (!text) return null;
  const tagged = text.match(/FINAL_ANSWER:\s*([^\n]+?)\s*(?:\n+\s*SOLUTION:\s*([\s\S]*))?$/i);
  if (tagged && tagged[1].trim()) return { finalAnswer: tagged[1].replace(/^\*+|\*+$/g, '').trim(), solution: normaliseMathDelimiters((tagged[2] ?? '').trim()) };
  const parsed = parseLLMJson<{ final_answer?: unknown; solution?: unknown }>(text);
  if (!parsed || (typeof parsed.final_answer !== 'string' && typeof parsed.final_answer !== 'number')) return null;
  const finalAnswer = String(parsed.final_answer).trim();
  if (!finalAnswer) return null;
  return { finalAnswer, solution: typeof parsed.solution === 'string' ? normaliseMathDelimiters(parsed.solution.trim()) : '' };
}

const compactMath = (text: string) => text.toLowerCase().replace(/\\(?:left|right|,|;|!|displaystyle|dfrac)/g, (m) => (m === '\\dfrac' ? '\\frac' : '')).replace(/[\s$]/g, '').replace(/\.$/, '');
const NUMBER = /^[+-]?\d*\.?\d+$/;

/**
 * An answer reduced to something comparable: the option letter for multiple choice, a number for numerical
 * questions, True/False, or a compact form of an expression. Null when it cannot be interpreted.
 */
export function normaliseAnswer(type: string, answer: string, options: unknown): string | null {
  const text = (answer ?? '').trim();
  if (!text || /^unanswerable$/i.test(text)) return null;
  const list = parseQuestionOptions(options);
  if (MCQ_TYPES.has(type) && list.length >= 2) {
    const index = resolveCorrectOptionIndex(text, list);
    return index >= 0 ? String.fromCharCode(65 + index) : null;
  }
  if (type === 'INTEGER') {
    const plain = text.replace(/[\s$]/g, '');
    return NUMBER.test(plain) ? String(Number(plain)) : null;
  }
  if (type === 'TRUE_FALSE') return /^t(rue)?$/i.test(text) ? 'True' : /^f(alse)?$/i.test(text) ? 'False' : null;
  return compactMath(text);
}

export function answersAgree(type: string, a: string, b: string, options: unknown): boolean {
  const x = normaliseAnswer(type, a, options);
  const y = normaliseAnswer(type, b, options);
  return x !== null && y !== null && x === y;
}

/** Why a question should not be drafted, or null if it is a fair candidate. */
export function notDraftableReason(codes: string[], q: DraftQuestion): string | null {
  const blocking = codes.filter((c) => !['MISSING_ANSWER', 'MISSING_EXPLANATION', 'PLACEHOLDER_EXPLANATION'].includes(c));
  if (blocking.length > 0) return `has other problems first (${blocking.join(', ')})`;
  if (q.content.trim().length < 15) return 'question too short to solve';
  if (MCQ_TYPES.has(q.type) && parseQuestionOptions(q.options).length < 2) return 'no options';
  return null;
}

export type Tier = 'VERIFIED' | 'SINGLE_MODEL';

export interface Draft {
  tier: Tier;
  answer?: string;
  explanation?: string;
  notes: string[];
}

/**
 * Combines the solver replies into a draft, or a reason for none.
 *  - first: the model that also wrote the solution.
 *  - second: an independent model's answer, required when the question has no answer yet.
 */
export function composeDraft(q: DraftQuestion, first: SolverReply | null, second: SolverReply | null): { draft: Draft | null; skipped?: string } {
  const objective = OBJECTIVE_TYPES.has(q.type);
  const needsAnswer = objective && !(q.correctAnswer ?? '').trim();
  const needsExplanation = (q.explanation ?? '').trim().length < 5;
  if (!first) return { draft: null, skipped: 'no usable reply from the first model' };
  if (/^unanswerable$/i.test(first.finalAnswer)) return { draft: null, skipped: 'the model says it cannot be answered from the text' };

  const draft: Draft = { tier: 'VERIFIED', notes: [] };
  const storedAnswer = (q.correctAnswer ?? '').trim();

  if (needsAnswer) {
    if (!second) return { draft: null, skipped: 'no second opinion available to check the answer' };
    if (!answersAgree(q.type, first.finalAnswer, second.finalAnswer, q.options)) return { draft: null, skipped: 'the two models disagree' };
    draft.answer = normaliseAnswer(q.type, first.finalAnswer, q.options)!;
    draft.notes.push('answer found independently by two models, which agree');
  } else if (storedAnswer && objective) {
    if (!answersAgree(q.type, first.finalAnswer, storedAnswer, q.options)) return { draft: null, skipped: 'the model\'s answer differs from the stored answer; the stored answer may be wrong' };
    draft.notes.push('worked solution reaches the stored answer');
  } else if (storedAnswer) {
    // A written answer: compare the compact forms. If they differ the solution is not trusted.
    if (!answersAgree(q.type, first.finalAnswer, storedAnswer, q.options)) { draft.tier = 'SINGLE_MODEL'; draft.notes.push('could not confirm the final result matches the stored answer'); }
    else draft.notes.push('worked solution reaches the stored answer');
  } else {
    draft.tier = 'SINGLE_MODEL';
    draft.notes.push('one model only; nothing to check it against');
  }

  if (needsExplanation) {
    const repaired = repairLatexField(first.solution);
    const text = repaired.stillBroken ? first.solution : repaired.text;
    if (text.trim().length < 40) return needsAnswer && draft.answer ? { draft: { ...draft, notes: [...draft.notes, 'no usable worked solution'] } } : { draft: null, skipped: 'worked solution missing or too short' };
    if (!fieldRenders(text)) return needsAnswer && draft.answer ? { draft: { ...draft, notes: [...draft.notes, 'worked solution did not render, so it was not kept'] } } : { draft: null, skipped: 'worked solution does not render' };
    // A written-answer question with a mismatching final result keeps no solution: it could teach the wrong thing.
    if (draft.tier === 'SINGLE_MODEL' && storedAnswer) return { draft: null, skipped: 'solution could not be checked against the stored answer' };
    draft.explanation = text.trim();
  }
  if (draft.answer === undefined && draft.explanation === undefined) return { draft: null, skipped: 'nothing to add' };
  return { draft };
}
