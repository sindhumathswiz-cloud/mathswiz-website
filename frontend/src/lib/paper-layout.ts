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

/** "Q3." style number that restarts in every section, as printed papers do. */
export const questionNumber = (indexInSection: number) => `${indexInSection + 1}.`;

export function optionList(options: unknown): string[] {
  const parsed = typeof options === 'string' ? safeParse(options) : options;
  return Array.isArray(parsed) ? parsed.map(String) : [];
}

function safeParse(text: string): unknown {
  try { return JSON.parse(text); } catch { return []; }
}

export interface KeyLine { section: string; number: string; answer: string }

/** The teacher's answer key, one line per auto-marked question; written answers say they are teacher-marked. */
export function answerKeyLines(sections: Array<{ title: string; questions: Array<{ type: string; correctAnswer: string | null }> }>): KeyLine[] {
  return sections.flatMap(section => section.questions.map((question, index) => ({
    section: section.title,
    number: questionNumber(index),
    answer: paperShapeOf(question.type) === 'WRITTEN' ? 'Marked by the teacher' : (question.correctAnswer ?? '').toString().trim() || 'Not recorded',
  })));
}
