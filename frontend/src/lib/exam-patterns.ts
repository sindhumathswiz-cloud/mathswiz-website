/**
 * Exam patterns for mock exams: the section structure and marking scheme of a
 * real paper, so a teacher builds "a JEE Main Mathematics mock" in one step and
 * the student sees the paper they will face.
 *
 * Pure data and arithmetic, safe for the browser and the server. Multiple-choice and
 * numerical sections are scored by the server on submit. Written sections (the CBSE
 * board paper) are typed on the exam screen and marked by the teacher afterwards, so a
 * student's total is complete only once those are reviewed.
 *
 * The figures are a starting point, not an authority: exam bodies change marking,
 * duration and attempt rules between years, so each pattern says to check the
 * current notice, and the test builder lets a teacher change every number.
 */

export type PatternQuestionKind = 'MCQ' | 'NUMERICAL' | 'WRITTEN';

export interface PatternSection {
  title: string;
  instructions: string;
  kind: PatternQuestionKind;
  // The question type the builder pre-selects when filling this section.
  questionType: string;
  questionCount: number;
  // Only the first N answered questions are scored; null = every question counts.
  attemptLimit: number | null;
  marksPerQuestion: number;
  negativeMarks: number;
}

export interface ExamPattern {
  id: string;
  name: string;
  summary: string;
  durationMinutes: number;
  sections: PatternSection[];
  // Shown beside the pattern: what to verify before relying on it.
  verifyNote: string;
}

export const EXAM_PATTERNS: ExamPattern[] = [
  {
    id: 'JEE_MAIN_MATHS',
    name: 'JEE Main — Mathematics',
    summary: '25 questions, 100 marks, 60 minutes',
    durationMinutes: 60,
    verifyNote: 'Checked 6 Oct 2026 against published summaries of the 2026 NTA bulletin: 20 multiple-choice and 5 numerical questions per subject, all compulsory, +4 / −1 on both. The "attempt any 5 of 10" choice ended in 2023. The three-hour paper covers three subjects, so 60 minutes is a Mathematics-only share. Confirm on jeemain.nta.nic.in.',
    sections: [
      { title: 'Section A', instructions: 'Single-correct multiple choice. Correct +4, wrong −1, unanswered 0.', kind: 'MCQ', questionType: 'SINGLE_CHOICE', questionCount: 20, attemptLimit: null, marksPerQuestion: 4, negativeMarks: 1 },
      { title: 'Section B', instructions: 'Numerical value. All questions are compulsory. Correct +4, wrong −1, unanswered 0.', kind: 'NUMERICAL', questionType: 'INTEGER', questionCount: 5, attemptLimit: null, marksPerQuestion: 4, negativeMarks: 1 },
    ],
  },
  {
    id: 'NDA_MATHS',
    name: 'NDA — Mathematics',
    summary: '120 questions, 300 marks, 150 minutes',
    durationMinutes: 150,
    verifyNote: 'Checked 6 Oct 2026 against published summaries of the UPSC pattern: 120 questions, 2.5 marks each, 2.5 hours, one third deducted for a wrong answer (shown here as 0.83). Confirm on upsc.gov.in.',
    sections: [
      { title: 'Mathematics', instructions: 'Single-correct multiple choice. Correct +2.5, wrong −0.83 (one third), unanswered 0.', kind: 'MCQ', questionType: 'SINGLE_CHOICE', questionCount: 120, attemptLimit: null, marksPerQuestion: 2.5, negativeMarks: 0.83 },
    ],
  },
  {
    id: 'CUET_MATHS',
    name: 'CUET — Mathematics',
    summary: '50 questions, 250 marks, 60 minutes',
    durationMinutes: 60,
    verifyNote: 'Checked 6 Oct 2026 against published summaries of the 2026 NTA bulletin: 50 questions, all to be attempted (the earlier "attempt 40 of 50" choice is gone), +5 / −1, 60 minutes. Confirm on cuet.nta.nic.in.',
    sections: [
      { title: 'Mathematics', instructions: 'Single-correct multiple choice. All questions are compulsory. Correct +5, wrong −1, unanswered 0.', kind: 'MCQ', questionType: 'SINGLE_CHOICE', questionCount: 50, attemptLimit: null, marksPerQuestion: 5, negativeMarks: 1 },
    ],
  },
  {
    id: 'CBSE_12_MATHS',
    name: 'CBSE Class 12 — Mathematics (board paper)',
    summary: '38 questions, 80 marks, 3 hours, with written sections',
    durationMinutes: 180,
    verifyNote: 'Checked 6 Oct 2026 against the published 2025-26 sample paper structure: Sections A–E, every section compulsory, internal choice in two questions each of B, C and D (not enforced here: a teacher includes one version of each). Sections B–E are written and marked by the teacher. Confirm on cbseacademic.nic.in; the paper design is revised most years.',
    sections: [
      { title: 'Section A', instructions: '18 multiple-choice questions and 2 assertion-and-reason questions, 1 mark each. No negative marking.', kind: 'MCQ', questionType: 'SINGLE_CHOICE', questionCount: 20, attemptLimit: null, marksPerQuestion: 1, negativeMarks: 0 },
      { title: 'Section B', instructions: 'Very short answer questions, 2 marks each.', kind: 'WRITTEN', questionType: 'VERY_SHORT_ANSWER', questionCount: 5, attemptLimit: null, marksPerQuestion: 2, negativeMarks: 0 },
      { title: 'Section C', instructions: 'Short answer questions, 3 marks each.', kind: 'WRITTEN', questionType: 'SHORT_ANSWER', questionCount: 6, attemptLimit: null, marksPerQuestion: 3, negativeMarks: 0 },
      { title: 'Section D', instructions: 'Long answer questions, 5 marks each.', kind: 'WRITTEN', questionType: 'LONG_ANSWER', questionCount: 4, attemptLimit: null, marksPerQuestion: 5, negativeMarks: 0 },
      { title: 'Section E', instructions: 'Case-based questions with sub-parts, 4 marks each. Answer every sub-part in the box.', kind: 'WRITTEN', questionType: 'CASE_STUDY', questionCount: 3, attemptLimit: null, marksPerQuestion: 4, negativeMarks: 0 },
    ],
  },
];

export function findExamPattern(id: string | null | undefined): ExamPattern | null {
  return EXAM_PATTERNS.find(pattern => pattern.id === id) ?? null;
}

export interface MarkedSection {
  questionCount: number;
  attemptLimit?: number | null;
  marksPerQuestion: number;
}

/** The most a section can contribute: marks per question times the questions that count. */
export function sectionMaxMarks(section: MarkedSection): number {
  const counted = section.attemptLimit != null && section.attemptLimit > 0 ? Math.min(section.questionCount, section.attemptLimit) : section.questionCount;
  return roundMarks(counted * section.marksPerQuestion);
}

export function examMaxMarks(sections: MarkedSection[]): number {
  return roundMarks(sections.reduce((sum, section) => sum + sectionMaxMarks(section), 0));
}

/** Avoids 99.99999999999999 from fractional marks (2.5 x 120 is fine; 0.83 x n is not). */
export function roundMarks(value: number): number {
  return Math.round(value * 100) / 100;
}

const mark = (value: number) => (Number.isInteger(value) ? String(value) : String(roundMarks(value)));

/** "+4 correct · −1 wrong" or "+4 correct · no negative marking". */
export function markingLabel(section: { marksPerQuestion: number; negativeMarks: number }): string {
  return section.negativeMarks > 0
    ? `+${mark(section.marksPerQuestion)} correct · −${mark(section.negativeMarks)} wrong`
    : `+${mark(section.marksPerQuestion)} correct · no negative marking`;
}

/** "Attempt any 5 of 10" for a limited section, null otherwise. */
export function attemptRuleLabel(section: { questionCount: number; attemptLimit?: number | null }): string | null {
  return section.attemptLimit != null && section.attemptLimit > 0 && section.attemptLimit < section.questionCount
    ? `Attempt any ${section.attemptLimit} of ${section.questionCount}`
    : null;
}

/** The sections a builder starts from for a pattern, ready to be filled with questions. */
export function sectionsFromPattern(pattern: ExamPattern) {
  return pattern.sections.map(section => ({
    title: section.title,
    instructions: section.instructions,
    marksPerQuestion: section.marksPerQuestion,
    negativeMarks: section.negativeMarks,
    attemptLimit: section.attemptLimit,
    // How many questions to fill, and which kind: the picker uses these to pre-select.
    targetQuestions: section.questionCount,
    kind: section.kind,
    questionType: section.questionType,
  }));
}

export function patternMaxMarks(pattern: ExamPattern): number {
  return examMaxMarks(pattern.sections);
}
