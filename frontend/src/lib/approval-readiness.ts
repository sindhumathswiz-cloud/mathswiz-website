import { analyzeQuestion } from './question-qa';

/**
 * Whether a draft is complete enough to be approved without a person: properly tagged, answered, and with a real
 * worked solution. This is only the completeness half; whether the answer is right is checked separately, by the
 * independent re-derivation in verify-mathematics, which also applies the approval gates (provenance, structure,
 * figures). Returns the reasons it is not ready -- empty when it is.
 */

export interface ReadinessQuestion {
  content: string;
  options: unknown;
  correctAnswer: string | null;
  explanation: string | null;
  type: string;
  tags: string[];
  topic: string | null;
  difficulty: string | null;
  bookId: string | null;
  bookChapterId: string | null;
  sourcePageStart: number | null;
  printedNumber: string | null;
  verificationStatus: string | null;
}

/** Tags that say a person still has to look at the question. */
export const NEEDS_A_PERSON_TAGS = ['Check Against Page', 'Questions without Solutions', 'Hint Available', 'Second-Review: Flagged', 'AI-Verified: Flagged'];

// Quality warnings that mean the answer or the solution is missing, wrong-looking or garbled.
const BLOCKING_WARNINGS = new Set(['MISSING_ANSWER', 'MISSING_EXPLANATION', 'PLACEHOLDER_EXPLANATION', 'ANSWER_NOT_IN_OPTIONS', 'OCR_GARBLE', 'MISSING_DATA']);

/** A worked solution shorter than this (letters, digits and symbols, spaces aside) is a bare answer, not a solution. */
export const MIN_SOLUTION_CHARS = 40;

const OPTION_CORRECT = /Option\s*\}?\s*\(?\s*([a-d])\s*\)?\s*(?:\\text\s*\{\s*)?is\s+correct/gi;

export function approvalReadiness(q: ReadinessQuestion): string[] {
  const reasons: string[] = [];
  const options = Array.isArray(q.options) ? (q.options as unknown[]).map(String) : [];
  const answer = (q.correctAnswer ?? '').trim();
  const explanation = (q.explanation ?? '').trim();

  if (q.verificationStatus !== 'STRUCTURALLY_VALID') reasons.push(`status:${q.verificationStatus ?? 'none'}`);
  for (const tag of NEEDS_A_PERSON_TAGS) if (q.tags.includes(tag)) reasons.push(`tag:${tag}`);

  // Properly tagged: filed under a chapter with a topic and difficulty, and, from a book, its page and printed number.
  if (!q.bookChapterId || !(q.topic ?? '').trim()) reasons.push('no_chapter');
  if (!(q.difficulty ?? '').trim()) reasons.push('no_difficulty');
  if (q.bookId && (q.sourcePageStart == null || !(q.printedNumber ?? '').trim())) reasons.push('no_source');

  for (const issue of analyzeQuestion({ content: q.content, options, correctAnswer: answer, explanation, type: q.type })) {
    if (issue.severity === 'error' || BLOCKING_WARNINGS.has(issue.code)) reasons.push(`qa:${issue.code}`);
  }
  if (explanation && explanation.replace(/\s+/g, '').length < MIN_SOLUTION_CHARS) reasons.push('solution_too_short');

  // A worked solution that names the right option must name the stored one.
  if (options.length >= 2 && /^[A-Da-d]$/.test(answer)) {
    const named = [...explanation.matchAll(OPTION_CORRECT)].map((m) => m[1].toUpperCase());
    if (named.length && named[named.length - 1] !== answer.toUpperCase()) reasons.push('answer_solution_disagree');
  }
  return reasons;
}
