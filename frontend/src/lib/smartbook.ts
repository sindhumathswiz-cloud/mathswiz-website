/**
 * Smartbook: a book read page by page beside its approved questions, exercise by exercise.
 *
 * A book appears to students only once an admin publishes it (Book.smartbookPublishedAt) and only to students of its
 * class. An exercise shows its own printed pages and the approved, public questions that belong to it (linked to it,
 * or starting inside its pages: question-source-filter.ts). Answers and explanations are never part of what is sent
 * to read; a student gets them after answering (api/student/smartbook/questions/[id]/solution).
 */
import { exerciseLabel, questionInExercise, type ExerciseRange, type QuestionSourceFields } from './question-source-filter';
import { naturalCompare } from './page-image-import';

export const SMARTBOOK_PREMIUM_DESCRIPTION = "Your textbook's exercises, page by page, with every question to practise and its worked answer.";

export interface OutlineChapter {
  id: string;
  name: string;
  chapterNumber: string | null;
  startPage: number | null;
  orderIndex: number;
}

export interface OutlineExercise extends ExerciseRange {
  code: string | null;
  title: string | null;
  sectionType: string | null;
  orderIndex: number;
}

export interface SmartbookOutline {
  chapters: Array<{
    id: string;
    name: string;
    chapterNumber: string | null;
    questionCount: number;
    exercises: Array<{ id: string; label: string; sectionType: string | null; startPage: number | null; endPage: number | null; questionCount: number }>;
  }>;
  questionCount: number;
}

const byPage = (a: { startPage: number | null; orderIndex: number }, b: { startPage: number | null; orderIndex: number }) =>
  (a.startPage ?? Number.MAX_SAFE_INTEGER) - (b.startPage ?? Number.MAX_SAFE_INTEGER) || a.orderIndex - b.orderIndex;

/**
 * Chapters in book order (by page, not extraction order), each with the exercises that hold at least one approved
 * question. Chapters with none are left out: a reader should never open an empty exercise.
 */
export function buildOutline(chapters: OutlineChapter[], exercises: OutlineExercise[], questions: QuestionSourceFields[]): SmartbookOutline {
  const out: SmartbookOutline['chapters'] = [];
  for (const chapter of [...chapters].sort(byPage)) {
    const own = exercises.filter((e) => e.chapterId === chapter.id).sort(byPage);
    const listed = own
      .map((exercise) => ({
        id: exercise.id,
        label: exerciseLabel(exercise),
        sectionType: exercise.sectionType,
        startPage: exercise.startPage,
        endPage: exercise.endPage,
        questionCount: questions.filter((q) => questionInExercise(q, exercise)).length,
      }))
      .filter((e) => e.questionCount > 0);
    if (listed.length === 0) continue;
    // Two sections can share a label ("Long answer" twice); their pages tell them apart.
    const seen = new Map<string, number>();
    for (const e of listed) seen.set(e.label, (seen.get(e.label) ?? 0) + 1);
    for (const e of listed) {
      if ((seen.get(e.label) ?? 0) > 1 && e.startPage != null) e.label = `${e.label} (${e.endPage != null && e.endPage !== e.startPage ? `pp. ${e.startPage}–${e.endPage}` : `p. ${e.startPage}`})`;
    }
    out.push({ id: chapter.id, name: chapter.name, chapterNumber: chapter.chapterNumber, exercises: listed, questionCount: listed.reduce((n, e) => n + e.questionCount, 0) });
  }
  return { chapters: out, questionCount: out.reduce((n, c) => n + c.questionCount, 0) };
}

/** The printed pages an exercise covers, capped so a mis-entered range cannot ask for a whole book. */
export const MAX_EXERCISE_PAGES = 30;
export function exercisePages(exercise: { startPage: number | null; endPage: number | null }): number[] {
  if (exercise.startPage == null) return [];
  const end = exercise.endPage != null && exercise.endPage >= exercise.startPage ? exercise.endPage : exercise.startPage;
  const pages: number[] = [];
  for (let page = exercise.startPage; page <= end && pages.length < MAX_EXERCISE_PAGES; page++) pages.push(page);
  return pages;
}

/** Questions in the order they are printed: by page, then by printed number (2 before 10, 3(a) before 3(b)). */
export function inPrintedOrder<T extends { sourcePageStart: number | null; printedNumber: string | null; createdAt?: Date | string }>(questions: T[]): T[] {
  return [...questions].sort((a, b) =>
    (a.sourcePageStart ?? Number.MAX_SAFE_INTEGER) - (b.sourcePageStart ?? Number.MAX_SAFE_INTEGER)
    || naturalCompare(a.printedNumber ?? '', b.printedNumber ?? '')
    || String(a.createdAt ?? '').localeCompare(String(b.createdAt ?? '')));
}

/** A page a student may see: one inside some exercise or theory section of the book. */
export function pageIsInBook(page: number, exercises: Array<{ startPage: number | null; endPage: number | null }>): boolean {
  return exercises.some((e) => e.startPage != null && page >= e.startPage && page <= (e.endPage ?? e.startPage));
}
