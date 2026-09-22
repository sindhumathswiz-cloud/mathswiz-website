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

export function summarizeReconciliation(rows: ExerciseReconciliationRow[]) {
  return {
    exerciseCount: rows.length,
    discrepantCount: rows.filter((r) => r.discrepancies.length > 0).length,
    totalExpected: rows.reduce((sum, r) => sum + (r.expectedQuestionCount ?? 0), 0),
    totalExtracted: rows.reduce((sum, r) => sum + r.extractedQuestionCount, 0),
    totalMatched: rows.reduce((sum, r) => sum + r.matchedQuestionCount, 0),
    totalUnresolved: rows.reduce((sum, r) => sum + r.unresolvedQuestionCount, 0),
  };
}

export interface BookCoverageSummary {
  bookId: string;
  bookTitle: string;
  className: string;
  subject: string;
  exerciseCount: number;
  discrepantCount: number;
  totalExpected: number;
  totalExtracted: number;
  totalMatched: number;
  totalUnresolved: number;
}

/**
 * Cross-book curriculum coverage rollup for the admin reporting view.
 * Reads already-persisted BookExercise counts directly (the same ones
 * bookReconciliationReport() reads for one book) rather than triggering a
 * live recompute per book -- cheap, safe to call on every admin page load,
 * same reasoning as this file's own GET route above.
 */
export async function crossBookReconciliationSummary(): Promise<{ books: BookCoverageSummary[]; platform: ReturnType<typeof summarizeReconciliation> }> {
  const exercises = await prisma.bookExercise.findMany({
    where: {
      chapter: { manifestConfirmedAt: { not: null } },
      OR: [{ sectionType: null }, { sectionType: { notIn: [...NON_QUESTION_SECTIONS] } }],
    },
    select: {
      expectedQuestionCount: true,
      extractedQuestionCount: true,
      matchedQuestionCount: true,
      unresolvedQuestionCount: true,
      chapter: { select: { bookId: true, book: { select: { title: true, className: true, subject: true } } } },
    },
  });

  const byBook = new Map<string, { title: string; className: string; subject: string; rows: ExerciseReconciliationRow[] }>();
  for (const ex of exercises) {
    const bookId = ex.chapter.bookId;
    const entry = byBook.get(bookId) ?? { title: ex.chapter.book.title, className: ex.chapter.book.className, subject: ex.chapter.book.subject, rows: [] };
    entry.rows.push({
      exerciseId: '', chapterId: '', chapterName: '', code: null, title: null, sectionType: null, startPage: null, endPage: null,
      expectedQuestionCount: ex.expectedQuestionCount,
      extractedQuestionCount: ex.extractedQuestionCount,
      matchedQuestionCount: ex.matchedQuestionCount,
      unresolvedQuestionCount: ex.unresolvedQuestionCount,
      reconciledAt: null,
      discrepancies: exerciseDiscrepancies(ex),
    });
    byBook.set(bookId, entry);
  }

  const books: BookCoverageSummary[] = [...byBook.entries()].map(([bookId, entry]) => ({
    bookId,
    bookTitle: entry.title,
    className: entry.className,
    subject: entry.subject,
    ...summarizeReconciliation(entry.rows),
  }));

  const platform = summarizeReconciliation([...byBook.values()].flatMap((e) => e.rows));

  return { books, platform };
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
