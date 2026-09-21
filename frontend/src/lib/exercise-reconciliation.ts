import prisma from './prisma';
import { loadConfirmedChapters, NON_QUESTION_SECTIONS, type ConfirmedChapter, type ConfirmedSection } from './book-manifest';

/**
 * Persistent per-exercise reconciliation: for every confirmed,
 * question-bearing BookExercise, how many questions were expected (admin
 * input), how many were actually extracted into its confirmed page range,
 * how many of those have a resolved answer/solution, and how many are
 * still unresolved.
 *
 * Deliberately does NOT use Question.bookExerciseId -- nothing in the
 * extraction pipeline ever sets that FK (extract-questions/route.ts links a
 * question to its bookChapterId only), so it's always null for real
 * book-sourced content. Exercise membership is instead resolved by page
 * range, the same way chapterForPage/sectionForPage in book-manifest.ts
 * already do it for the answer/solution matching passes: a question
 * belongs to whichever confirmed exercise's startPage..endPage contains
 * its sourcePageStart.
 */

const OBJECTIVE_TYPES = new Set(['SINGLE_CHOICE', 'MULTIPLE_CHOICE', 'INTEGER', 'TRUE_FALSE']);

function isResolved(question: { type: string; correctAnswer: string | null; explanation: string | null }): boolean {
  if (OBJECTIVE_TYPES.has(question.type)) return Boolean(question.correctAnswer?.trim());
  return Boolean(question.explanation?.trim());
}

export interface ExerciseReconciliationRow {
  exerciseId: string;
  chapterId: string;
  chapterName: string;
  code: string | null;
  title: string | null;
  sectionType: string | null;
  startPage: number | null;
  endPage: number | null;
  expectedQuestionCount: number | null;
  extractedQuestionCount: number;
  matchedQuestionCount: number;
  unresolvedQuestionCount: number;
  reconciledAt: Date | null;
  discrepancies: string[];
}

/**
 * Reasons THIS exercise, as it currently stands, isn't reconciled clean --
 * [] means no known problem. Purely a function of the stored counts, so it
 * works identically for a fresh recompute (reconcileBook) and a read of
 * already-stored values (bookReconciliationReport) -- the completion gate
 * always recomputes first so it never trusts stale numbers.
 */
export function exerciseDiscrepancies(exercise: {
  expectedQuestionCount: number | null;
  extractedQuestionCount: number;
  unresolvedQuestionCount: number;
}): string[] {
  const reasons: string[] = [];
  if (exercise.unresolvedQuestionCount > 0) {
    reasons.push(`${exercise.unresolvedQuestionCount} extracted question(s) still missing an answer or solution`);
  }
  if (exercise.expectedQuestionCount != null && exercise.extractedQuestionCount < exercise.expectedQuestionCount) {
    reasons.push(`expected ${exercise.expectedQuestionCount} question(s), only ${exercise.extractedQuestionCount} extracted`);
  }
  return reasons;
}

function toRow(chapter: ConfirmedChapter, section: ConfirmedSection): ExerciseReconciliationRow {
  return {
    exerciseId: section.id,
    chapterId: chapter.id,
    chapterName: chapter.name,
    code: section.code,
    title: section.title,
    sectionType: section.sectionType,
    startPage: section.startPage,
    endPage: section.endPage,
    expectedQuestionCount: section.expectedQuestionCount,
    extractedQuestionCount: section.extractedQuestionCount,
    matchedQuestionCount: section.matchedQuestionCount,
    unresolvedQuestionCount: section.unresolvedQuestionCount,
    reconciledAt: section.reconciledAt,
    discrepancies: exerciseDiscrepancies(section),
  };
}

const isQuestionBearing = (section: ConfirmedSection) => !section.sectionType || !NON_QUESTION_SECTIONS.has(section.sectionType);

/**
 * Recomputes and persists one exercise's counts from the questions
 * currently sitting in its confirmed page range. No-op (returns the
 * section unchanged) when the exercise has no confirmed page range yet --
 * there's nothing to count against.
 */
export async function reconcileExercise(bookId: string, section: Pick<ConfirmedSection, 'id' | 'startPage' | 'endPage'>): Promise<{ extractedQuestionCount: number; matchedQuestionCount: number; unresolvedQuestionCount: number; reconciledAt: Date }> {
  if (section.startPage == null || section.endPage == null) {
    const reconciledAt = new Date();
    await prisma.bookExercise.update({ where: { id: section.id }, data: { extractedQuestionCount: 0, matchedQuestionCount: 0, unresolvedQuestionCount: 0, reconciledAt } });
    return { extractedQuestionCount: 0, matchedQuestionCount: 0, unresolvedQuestionCount: 0, reconciledAt };
  }

  const questions = await prisma.question.findMany({
    where: {
      bookId,
      status: { not: 'ARCHIVED' },
      sourcePageStart: { gte: section.startPage, lte: section.endPage },
    },
    select: { type: true, correctAnswer: true, explanation: true },
  });

  const extractedQuestionCount = questions.length;
  const matchedQuestionCount = questions.filter(isResolved).length;
  const unresolvedQuestionCount = extractedQuestionCount - matchedQuestionCount;
  const reconciledAt = new Date();

  await prisma.bookExercise.update({
    where: { id: section.id },
    data: { extractedQuestionCount, matchedQuestionCount, unresolvedQuestionCount, reconciledAt },
  });

  return { extractedQuestionCount, matchedQuestionCount, unresolvedQuestionCount, reconciledAt };
}

/** Read-only: the report as of the last reconciliation, no recompute. */
export async function bookReconciliationReport(bookId: string): Promise<ExerciseReconciliationRow[]> {
  const chapters = await loadConfirmedChapters(bookId);
  const rows: ExerciseReconciliationRow[] = [];
  for (const chapter of chapters) {
    for (const section of chapter.exercises) {
      if (!isQuestionBearing(section)) continue;
      rows.push(toRow(chapter, section));
    }
  }
  return rows;
}

/** Recomputes and persists every confirmed, question-bearing exercise in the book, then returns the fresh report. */
export async function reconcileBook(bookId: string): Promise<ExerciseReconciliationRow[]> {
  const chapters = await loadConfirmedChapters(bookId);
  const rows: ExerciseReconciliationRow[] = [];
  for (const chapter of chapters) {
    for (const section of chapter.exercises) {
      if (!isQuestionBearing(section)) continue;
      const recomputed = await reconcileExercise(bookId, section);
      rows.push(toRow(chapter, { ...section, ...recomputed }));
    }
  }
  return rows;
}
