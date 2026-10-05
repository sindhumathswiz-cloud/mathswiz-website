import type { Prisma } from '@prisma/client';
import prisma from './prisma';
import { exerciseLabel, questionInExercise, sourceClauses, type ExerciseRange, type SourceBook, type SourceFilter } from './question-source-filter';

/**
 * Resolves a book / chapter / exercise filter into conditions a question query
 * can AND in. Loads the exercise (for its page range) only when one is asked for.
 */
export async function resolveSourceClauses(filter: SourceFilter): Promise<Prisma.QuestionWhereInput[]> {
  let exercise: ExerciseRange | null = null;
  if (filter.bookExerciseId) {
    const found = await prisma.bookExercise.findUnique({
      where: { id: filter.bookExerciseId },
      select: { id: true, chapterId: true, startPage: true, endPage: true, chapter: { select: { bookId: true } } },
    });
    if (found) exercise = { id: found.id, chapterId: found.chapterId, bookId: found.chapter.bookId, startPage: found.startPage, endPage: found.endPage };
  }
  return sourceClauses(filter, exercise);
}

/**
 * The book -> chapter -> exercise tree a teacher picks from, with how many
 * approved, public questions sit under each node. Only nodes that have at least
 * one such question are listed: a selector must never lead to an empty list.
 * Chapters are in book order (by page), not the order they were extracted in.
 */
export async function loadQuestionSources(): Promise<SourceBook[]> {
  const questions = await prisma.question.findMany({
    where: { status: 'APPROVED', scope: 'PUBLIC', bookId: { not: null } },
    select: { bookId: true, bookChapterId: true, bookExerciseId: true, sourcePageStart: true },
  });
  if (questions.length === 0) return [];

  const bookIds = [...new Set(questions.map(q => q.bookId).filter((id): id is string => Boolean(id)))];
  const [books, chapters, exercises] = await Promise.all([
    prisma.book.findMany({ where: { id: { in: bookIds } }, select: { id: true, title: true, className: true }, orderBy: { title: 'asc' } }),
    prisma.bookChapter.findMany({ where: { bookId: { in: bookIds } }, select: { id: true, bookId: true, name: true, chapterNumber: true, startPage: true, orderIndex: true } }),
    prisma.bookExercise.findMany({
      where: { chapter: { bookId: { in: bookIds } } },
      select: { id: true, chapterId: true, code: true, title: true, sectionType: true, startPage: true, endPage: true, orderIndex: true },
    }),
  ]);

  const chapterBook = new Map(chapters.map(chapter => [chapter.id, chapter.bookId]));
  const ranges: Array<ExerciseRange & { code: string | null; title: string | null; sectionType: string | null; orderIndex: number }> = exercises.map(exercise => ({
    id: exercise.id, chapterId: exercise.chapterId, bookId: chapterBook.get(exercise.chapterId) ?? '',
    startPage: exercise.startPage, endPage: exercise.endPage,
    code: exercise.code, title: exercise.title, sectionType: exercise.sectionType, orderIndex: exercise.orderIndex,
  }));

  return books.map((book): SourceBook => {
    const bookQuestions = questions.filter(q => q.bookId === book.id);
    const bookChapters = chapters
      .filter(chapter => chapter.bookId === book.id)
      // Book order: by the chapter's first page; extraction order is not page order.
      .sort((a, b) => (a.startPage ?? Number.MAX_SAFE_INTEGER) - (b.startPage ?? Number.MAX_SAFE_INTEGER) || a.orderIndex - b.orderIndex)
      .map(chapter => {
        const chapterQuestions = bookQuestions.filter(q => q.bookChapterId === chapter.id);
        const chapterExercises = ranges
          .filter(range => range.chapterId === chapter.id)
          .sort((a, b) => (a.startPage ?? Number.MAX_SAFE_INTEGER) - (b.startPage ?? Number.MAX_SAFE_INTEGER) || a.orderIndex - b.orderIndex)
          .map(range => ({
            id: range.id,
            label: exerciseLabel(range),
            sectionType: range.sectionType,
            total: chapterQuestions.filter(q => questionInExercise({ ...q, bookId: book.id }, range)).length,
          }))
          .filter(exercise => exercise.total > 0);
        // Two sections of a chapter can share a label ("Long answer" twice); the pages tell them apart.
        const labelCount = new Map<string, number>();
        for (const exercise of chapterExercises) labelCount.set(exercise.label, (labelCount.get(exercise.label) ?? 0) + 1);
        for (const exercise of chapterExercises) {
          if ((labelCount.get(exercise.label) ?? 0) < 2) continue;
          const range = ranges.find(candidate => candidate.id === exercise.id);
          if (range?.startPage != null) exercise.label = `${exercise.label} (${range.endPage != null && range.endPage !== range.startPage ? `pp. ${range.startPage}–${range.endPage}` : `p. ${range.startPage}`})`;
        }
        return { id: chapter.id, name: chapter.name, chapterNumber: chapter.chapterNumber, total: chapterQuestions.length, exercises: chapterExercises };
      })
      .filter(chapter => chapter.total > 0);
    return { id: book.id, title: book.title, className: book.className, total: bookQuestions.length, chapters: bookChapters };
  }).filter(book => book.total > 0);
}
