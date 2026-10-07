import { isNumericalType, isWrittenType } from './exam-view';

/**
 * Decisions for the printed question paper, kept apart from the page so they can be tested:
 * how a question is laid out on paper, and how much room a written answer is given.
 */

export type PaperQuestionShape = 'CHOICE' | 'NUMERICAL' | 'WRITTEN';

export function paperShapeOf(type: string): PaperQuestionShape {
  if (isWrittenType(type)) return 'WRITTEN';
  if (isNumericalType(type)) return 'NUMERICAL';
  return 'CHOICE';
}

/** Ruled lines for a written answer: about three per mark, never fewer than 4 or more than 30. */
export function answerLinesFor(marks: number): number {
  const lines = Math.round((Number.isFinite(marks) ? marks : 0) * 3);
  return Math.min(30, Math.max(4, lines));
}

/** "3." style number, counted from 1. */
export const questionNumber = (indexInSection: number) => `${indexInSection + 1}.`;

export interface PrintedNumber {
  // The number of the question slot this question occupies: alternatives share one.
  number: string;
  // True for the second and later alternative of a pair: printed after an "OR", without a number of its own.
  orBefore: boolean;
}

/**
 * Numbers a section's questions as a printed paper does: alternatives (internal choice) share one
 * number and are separated by "OR", so Q3 OR Q4 prints as "3." followed by "OR" and the second
 * alternative, and the next question is "4.".
 */
export function printedNumbering(questions: Array<{ choiceGroup?: string | null }>): PrintedNumber[] {
  let slot = 0;
  return questions.map((question, index) => {
    const previous = questions[index - 1];
    const continuesGroup = !!question.choiceGroup && !!previous && previous.choiceGroup === question.choiceGroup;
    if (!continuesGroup) slot += 1;
    return { number: questionNumber(slot - 1), orBefore: continuesGroup };
  });
}

export function optionList(options: unknown): string[] {
  const parsed = typeof options === 'string' ? safeParse(options) : options;
  return Array.isArray(parsed) ? parsed.map(String) : [];
}

function safeParse(text: string): unknown {
  try { return JSON.parse(text); } catch { return []; }
}

export interface KeyLine { section: string; number: string; answer: string }

/** The teacher's answer key, one line per question; written answers say they are teacher-marked. */
export function answerKeyLines(sections: Array<{ title: string; questions: Array<{ type: string; correctAnswer: string | null; choiceGroup?: string | null }> }>): KeyLine[] {
  return sections.flatMap(section => {
    const numbering = printedNumbering(section.questions);
    return section.questions.map((question, index) => ({
      section: section.title,
      number: `${numbering[index].number}${numbering[index].orBefore ? ' (OR)' : ''}`,
      answer: paperShapeOf(question.type) === 'WRITTEN' ? 'Marked by the teacher' : (question.correctAnswer ?? '').toString().trim() || 'Not recorded',
    }));
  });
}
