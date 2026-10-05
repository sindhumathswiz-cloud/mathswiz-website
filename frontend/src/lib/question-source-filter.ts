import type { Prisma } from '@prisma/client';

/**
 * Pure helpers for the Book -> Chapter -> Exercise selectors, kept free of the
 * database client so the browser can import them too.
 *
 * Why exercises are resolved by page range: extraction links a question to its
 * chapter (bookChapterId) but not to an exercise (bookExerciseId is empty for
 * every question today). An exercise is a confirmed page range of a chapter, and
 * a question records the page it starts on, so "this exercise's questions" is the
 * chapter's questions that start inside the exercise's pages -- plus any question
 * explicitly linked to the exercise, if a link is ever set.
 */

export interface SourceFilter {
  bookId?: string | null;
  bookChapterId?: string | null;
  bookExerciseId?: string | null;
}

export interface ExerciseRange {
  id: string;
  chapterId: string;
  bookId: string;
  startPage: number | null;
  endPage: number | null;
}

export interface QuestionSourceFields {
  bookId: string | null;
  bookChapterId: string | null;
  bookExerciseId: string | null;
  sourcePageStart: number | null;
}

const SECTION_LABEL: Record<string, string> = {
  EXERCISE: 'Exercise',
  MCQ: 'Multiple choice',
  SHORT_ANSWER: 'Short answer',
  LONG_ANSWER: 'Long answer',
  VERY_SHORT_ANSWER: 'Very short answer',
  SELF_ASSESSMENT: 'Self-assessment',
  NCERT_SELECTED: 'NCERT selected questions',
  NCERT_EXERCISE: 'NCERT exercise',
  EXEMPLAR: 'NCERT exemplar',
  PREVIOUS_YEAR: 'Previous year questions',
  CASE_STUDY: 'Case study',
};

const humanize = (value: string) => {
  const spaced = value.toLowerCase().replace(/_/g, ' ');
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
};

/** What a teacher reads in the dropdown: the printed title, else the code, else the kind of section. */
export function exerciseLabel(exercise: { code?: string | null; title?: string | null; sectionType?: string | null }): string {
  const title = exercise.title?.trim();
  const code = exercise.code?.trim();
  if (title && code && !title.includes(code)) return `${code} · ${title}`;
  if (title) return title;
  if (code) return code;
  if (exercise.sectionType) return SECTION_LABEL[exercise.sectionType] ?? humanize(exercise.sectionType);
  return 'Questions';
}

/** Does this question belong to this exercise (see the file comment)? */
export function questionInExercise(question: QuestionSourceFields, exercise: ExerciseRange): boolean {
  if (question.bookExerciseId === exercise.id) return true;
  if (question.bookExerciseId) return false; // explicitly linked to a different exercise
  if (question.bookChapterId !== exercise.chapterId) return false;
  if (question.sourcePageStart == null || exercise.startPage == null || exercise.endPage == null) return false;
  return question.sourcePageStart >= exercise.startPage && question.sourcePageStart <= exercise.endPage;
}

/**
 * The Prisma conditions for a source filter, to be AND-ed with whatever else the
 * caller is filtering on. An exercise that does not belong to the requested
 * book/chapter yields a condition that matches nothing, never the whole book.
 */
export function sourceClauses(filter: SourceFilter, exercise: ExerciseRange | null): Prisma.QuestionWhereInput[] {
  const clauses: Prisma.QuestionWhereInput[] = [];
  if (filter.bookId) clauses.push({ bookId: filter.bookId });
  if (filter.bookChapterId) clauses.push({ bookChapterId: filter.bookChapterId });
  if (filter.bookExerciseId) {
    const mismatched = !exercise
      || (filter.bookId && exercise.bookId !== filter.bookId)
      || (filter.bookChapterId && exercise.chapterId !== filter.bookChapterId);
    if (mismatched || !exercise) {
      clauses.push({ id: { in: [] } });
    } else if (exercise.startPage != null && exercise.endPage != null) {
      clauses.push({
        OR: [
          { bookExerciseId: exercise.id },
          { bookExerciseId: null, bookChapterId: exercise.chapterId, sourcePageStart: { gte: exercise.startPage, lte: exercise.endPage } },
        ],
      });
    } else {
      clauses.push({ bookExerciseId: exercise.id });
    }
  }
  return clauses;
}

export interface SourceExercise { id: string; label: string; sectionType: string | null; total: number }
export interface SourceChapter { id: string; name: string; chapterNumber: string | null; total: number; exercises: SourceExercise[] }
export interface SourceBook { id: string; title: string; className: string; total: number; chapters: SourceChapter[] }

/** Keeps a selection coherent when a higher level changes: choosing another book clears its chapter and exercise. */
export function reconcileSelection(books: SourceBook[], selection: { bookId: string; chapterId: string; exerciseId: string }) {
  const book = books.find(b => b.id === selection.bookId);
  const chapter = book?.chapters.find(c => c.id === selection.chapterId);
  const exercise = chapter?.exercises.find(e => e.id === selection.exerciseId);
  return { bookId: book ? book.id : '', chapterId: chapter ? chapter.id : '', exerciseId: exercise ? exercise.id : '' };
}
