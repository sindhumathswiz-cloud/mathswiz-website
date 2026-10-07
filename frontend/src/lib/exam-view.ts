import { isAnswered } from './exam-scoring';
import { attemptRuleLabel, examMaxMarks, markingLabel } from './exam-patterns';

/**
 * The exam screen's view logic, kept out of the component so it can be tested:
 * how a test's sections map onto the flat question list, what the palette counts
 * say, and whether a student may answer one more question in a limited section.
 */

export type QuestionStatus = 'NOT_VISITED' | 'NOT_ANSWERED' | 'ANSWERED' | 'MARKED_FOR_REVIEW' | 'ANSWERED_AND_MARKED';
export const STATUSES: QuestionStatus[] = ['ANSWERED', 'NOT_ANSWERED', 'NOT_VISITED', 'MARKED_FOR_REVIEW', 'ANSWERED_AND_MARKED'];

export interface ExamResponse {
  selectedOption: string | null;
  // The text of a written answer; the other kinds use selectedOption.
  subjectiveText?: string;
  status: QuestionStatus;
  timeSpent: number;
}

export interface ExamSection {
  id: string;
  title: string;
  instructions: string;
  marksPerQuestion: number;
  negativeMarks: number;
  attemptLimit: number | null;
  questionIds: string[];
  // Index of this section's first question in the flat question list.
  startIndex: number;
}

interface RawSection {
  id: string;
  title: string;
  instructions?: string | null;
  marksPerQuestion?: number | null;
  negativeMarks?: number | null;
  attemptLimit?: number | null;
  questions: Array<{ question: { id: string } }>;
}

export function buildExamSections(rawSections: RawSection[]): ExamSection[] {
  let startIndex = 0;
  return rawSections.map(section => {
    const questionIds = section.questions.map(item => item.question.id);
    const built: ExamSection = {
      id: section.id,
      title: section.title,
      instructions: section.instructions ?? '',
      marksPerQuestion: section.marksPerQuestion ?? 4,
      negativeMarks: section.negativeMarks ?? 0,
      attemptLimit: section.attemptLimit != null && section.attemptLimit > 0 && section.attemptLimit < questionIds.length ? section.attemptLimit : null,
      questionIds,
      startIndex,
    };
    startIndex += questionIds.length;
    return built;
  });
}

/** The section a flat question index belongs to (the last one for an index past the end). */
export function sectionIndexOf(sections: ExamSection[], flatIndex: number): number {
  for (let i = sections.length - 1; i >= 0; i--) {
    if (flatIndex >= sections[i].startIndex) return i;
  }
  return 0;
}

const hasAnswer = (response: ExamResponse | undefined) => isAnswered(response);

/** How many of a section's questions currently hold an answer. */
export function attemptedIn(section: ExamSection, responses: Record<string, ExamResponse | undefined>): number {
  return section.questionIds.filter(id => hasAnswer(responses[id])).length;
}

export type AnswerCheck = { ok: true } | { ok: false; reason: string };

/**
 * May the student put an answer on this question? Always yes if it already has
 * one (changing an answer never spends the limit), and yes in an unlimited
 * section. In a limited section a new answer is refused once the limit is used,
 * with the instruction to clear another first: the rule is stated before it can
 * cost anything, instead of the surplus being quietly discarded at scoring.
 */
export function canAnswer(section: ExamSection, responses: Record<string, ExamResponse | undefined>, questionId: string): AnswerCheck {
  if (section.attemptLimit === null || hasAnswer(responses[questionId])) return { ok: true };
  if (attemptedIn(section, responses) >= section.attemptLimit) {
    return { ok: false, reason: `You can answer only ${section.attemptLimit} questions in ${section.title}. Clear one of your answers to answer this one.` };
  }
  return { ok: true };
}

export function statusCounts(questionIds: string[], responses: Record<string, ExamResponse | undefined>): Record<QuestionStatus, number> {
  const counts: Record<QuestionStatus, number> = { ANSWERED: 0, NOT_ANSWERED: 0, NOT_VISITED: 0, MARKED_FOR_REVIEW: 0, ANSWERED_AND_MARKED: 0 };
  for (const id of questionIds) counts[responses[id]?.status ?? 'NOT_VISITED']++;
  return counts;
}

export interface SummaryRow {
  sectionId: string;
  title: string;
  total: number;
  counts: Record<QuestionStatus, number>;
  attempted: number;
  attemptLimit: number | null;
}

export function summaryRows(sections: ExamSection[], responses: Record<string, ExamResponse | undefined>): SummaryRow[] {
  return sections.map(section => ({
    sectionId: section.id,
    title: section.title,
    total: section.questionIds.length,
    counts: statusCounts(section.questionIds, responses),
    attempted: attemptedIn(section, responses),
    attemptLimit: section.attemptLimit,
  }));
}

/** Plain-language lines about what the student is about to hand in, most important first. */
export function submitWarnings(rows: SummaryRow[]): string[] {
  const warnings: string[] = [];
  for (const row of rows) {
    const required = row.attemptLimit ?? row.total;
    const unanswered = required - row.attempted;
    if (unanswered > 0) warnings.push(`${row.title}: ${unanswered} of ${required} ${row.attemptLimit ? 'you may answer ' : ''}still unanswered.`.replace('  ', ' '));
    const marked = row.counts.MARKED_FOR_REVIEW + row.counts.ANSWERED_AND_MARKED;
    if (marked > 0) warnings.push(`${row.title}: ${marked} marked for review.`);
  }
  return warnings;
}

export interface ExamSummaryLine { title: string; questions: number; rule: string | null; marking: string; maxMarks: number }

/** The table on the instructions screen: what each section asks and how it is marked. */
export function instructionRows(sections: ExamSection[]): ExamSummaryLine[] {
  return sections.map(section => ({
    title: section.title,
    questions: section.questionIds.length,
    rule: attemptRuleLabel({ questionCount: section.questionIds.length, attemptLimit: section.attemptLimit }),
    marking: markingLabel(section),
    maxMarks: examMaxMarks([{ questionCount: section.questionIds.length, attemptLimit: section.attemptLimit, marksPerQuestion: section.marksPerQuestion }]),
  }));
}

export function examMaxFromSections(sections: ExamSection[]): number {
  return examMaxMarks(sections.map(section => ({ questionCount: section.questionIds.length, attemptLimit: section.attemptLimit, marksPerQuestion: section.marksPerQuestion })));
}

// Answered in words and marked by a teacher. A case study is one box for its sub-parts.
const WRITTEN_TYPES = ['SUBJECTIVE', 'SHORT_ANSWER', 'LONG_ANSWER', 'VERY_SHORT_ANSWER', 'CASE_STUDY'];
export const isWrittenType = (type: string) => WRITTEN_TYPES.includes(type);
/** For database filters: written questions have no stored answer, so right/wrong statistics must leave them out. */
export const WRITTEN_QUESTION_TYPES = WRITTEN_TYPES;
export const isNumericalType = (type: string) => type === 'INTEGER';

export function questionTypeLabel(type: string): string {
  if (isNumericalType(type)) return 'Numerical value';
  if (type === 'MULTIPLE_CHOICE') return 'Multiple choice';
  if (type === 'TRUE_FALSE') return 'True / false';
  if (type === 'ASSERTION_REASONING') return 'Assertion and reason';
  if (isWrittenType(type)) return 'Written answer';
  return 'Single correct';
}

function hashSeed(seed: string): number {
  let h = 1779033703 ^ seed.length;
  for (let i = 0; i < seed.length; i++) {
    h = Math.imul(h ^ seed.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return h >>> 0;
}

/**
 * A shuffle that is the same every time for the same seed. Options used to be
 * re-shuffled on every visit to a question, so going back to check an answer
 * showed the choices in a different order. Seeding on attempt + question keeps
 * the order stable across visits and reloads while still differing per student.
 */
export function stableShuffle<T>(items: T[], seed: string): T[] {
  let state = hashSeed(seed);
  const next = () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(next() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}
