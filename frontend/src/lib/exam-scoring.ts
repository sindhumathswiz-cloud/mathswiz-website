/**
 * Scoring rules for an exam attempt that are more than "equal string = correct".
 * Pure functions, shared by the submit route (which is the only place scoring is
 * decided) and the exam screen (which uses the same rules to stop a student
 * over-attempting a limited section rather than silently discarding an answer).
 */

import { slotKeyOf, hasChoiceGroups, type GroupedQuestion } from './choice-groups';

export interface AnswerLike {
  selectedOption?: string | number | null;
  subjectiveText?: string | null;
  // Photos of handwritten working (ids of uploaded images).
  subjectiveImages?: string[] | null;
}

/** A picked option or typed number that is not just whitespace (a cleared numerical box is not an answer). */
export function hasChoice(response: AnswerLike | null | undefined): boolean {
  if (!response || response.selectedOption === null || response.selectedOption === undefined) return false;
  return String(response.selectedOption).trim() !== '';
}

/** A written answer with some text in it. */
export function hasWrittenText(response: AnswerLike | null | undefined): boolean {
  return typeof response?.subjectiveText === 'string' && response.subjectiveText.trim() !== '';
}

/** A written answer given as one or more photos. */
export function hasWrittenImages(response: AnswerLike | null | undefined): boolean {
  return Array.isArray(response?.subjectiveImages) && response.subjectiveImages.length > 0;
}

/** The question holds an answer of any kind: a choice, typed text, or a photo. */
export function isAnswered(response: AnswerLike | null | undefined): boolean {
  return hasChoice(response) || hasWrittenText(response) || hasWrittenImages(response);
}

/** Question types the server can score by comparing with the stored answer. */
export const AUTO_SCORED_TYPES = ['SINGLE_CHOICE', 'MULTIPLE_CHOICE', 'INTEGER', 'TRUE_FALSE', 'ASSERTION_REASONING'];

const NUMBER = /^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/;

/**
 * Numerical answers are compared as numbers, so "5", "05", "5.0" and " 5 " are
 * the same answer. Anything that is not a plain number falls back to an exact
 * string comparison, as before. Choice questions are always compared as exact
 * strings (an option letter).
 */
export function answersMatch(type: string, correct: string | null | undefined, selected: string): boolean {
  if (correct === null || correct === undefined) return false;
  if (type === 'INTEGER') {
    const a = correct.trim();
    const b = selected.trim();
    if (NUMBER.test(a) && NUMBER.test(b)) return Math.abs(Number(a) - Number(b)) < 1e-9;
    return a === b;
  }
  return correct === selected;
}

export interface LimitedSection {
  attemptLimit?: number | null;
  questions: GroupedQuestion[];
}

/**
 * For a section with an "attempt any N" limit, the ids of the questions that
 * count: the first N answered ones, in the section's question order. Null when the
 * section has no limit (everything counts). A student who answers more than N has
 * the surplus recorded but not scored, so a stray extra answer can never cost
 * marks or earn them.
 */
export function countedQuestionIds(section: LimitedSection, responses: Record<string, AnswerLike | undefined>): Set<string> | null {
  const limit = section.attemptLimit != null && section.attemptLimit > 0 ? section.attemptLimit : null;
  if (limit === null && !hasChoiceGroups(section.questions)) return null;
  const counted = new Set<string>();
  const slotsUsed = new Set<string>();
  for (const question of section.questions) {
    if (!isAnswered(responses[question.id])) continue;
    const slot = slotKeyOf(question);
    // Internal choice: the first alternative answered is the one that counts.
    if (slotsUsed.has(slot)) continue;
    if (limit !== null && slotsUsed.size >= limit) break;
    slotsUsed.add(slot);
    counted.add(question.id);
  }
  return counted;
}
