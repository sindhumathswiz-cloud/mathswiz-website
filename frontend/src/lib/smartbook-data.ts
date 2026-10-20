/**
 * Database side of the Smartbook (see smartbook.ts for the rules). Every loader checks the student's access itself:
 * the book is published as a Smartbook, active, and for the student's class; callers also check Premium.
 */
import type { Prisma } from '@prisma/client';
import prisma from './prisma';
import { isPremiumSubscription } from './subscription';
import { buildOutline, exercisePages, inPrintedOrder, type SmartbookOutline } from './smartbook';
import { exerciseLabel, questionInExercise } from './question-source-filter';

export async function studentSmartbookAccess(userId: string): Promise<{ premium: boolean; className: string | null }> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { subscription: true, class: true } });
  return { premium: isPremiumSubscription(user?.subscription), className: user?.class ?? null };
}

const publishedFor = (className: string | null) => ({ smartbookPublishedAt: { not: null }, isActive: true, className: className ?? '__no_class__' });

const approvedPublic = { status: 'APPROVED' as const, scope: 'PUBLIC' as const };

async function outlineOf(bookId: string): Promise<SmartbookOutline> {
  const [chapters, exercises, questions] = await Promise.all([
    prisma.bookChapter.findMany({ where: { bookId }, select: { id: true, name: true, chapterNumber: true, startPage: true, orderIndex: true } }),
    prisma.bookExercise.findMany({ where: { chapter: { bookId } }, select: { id: true, chapterId: true, startPage: true, endPage: true, code: true, title: true, sectionType: true, orderIndex: true } }),
    prisma.question.findMany({ where: { bookId, ...approvedPublic }, select: { bookId: true, bookChapterId: true, bookExerciseId: true, sourcePageStart: true } }),
  ]);
  return buildOutline(chapters, exercises.map((e) => ({ ...e, bookId })), questions);
}

/** The Smartbooks a student of this class can open, with how much each holds. */
export async function loadStudentSmartbooks(className: string | null) {
  const books = await prisma.book.findMany({
    where: publishedFor(className),
    select: { id: true, title: true, author: true, publisher: true, edition: true, className: true },
    orderBy: { title: 'asc' },
  });
  const withOutline = await Promise.all(books.map(async (book) => ({ ...book, outline: await outlineOf(book.id) })));
  return withOutline.filter((b) => b.outline.questionCount > 0);
}

export async function loadSmartbook(bookId: string, className: string | null) {
  const book = await prisma.book.findFirst({ where: { id: bookId, ...publishedFor(className) }, select: { id: true, title: true, author: true, publisher: true, edition: true, className: true } });
  if (!book) return null;
  return { ...book, outline: await outlineOf(book.id) };
}

export interface SmartbookQuestion {
  id: string;
  content: string;
  type: string;
  options: unknown;
  printedNumber: string | null;
  sourcePageStart: number | null;
  correctAnswer?: string | null;
  explanation?: string | null;
}

/** One exercise to read: its printed pages and its approved questions, without answers (students). */
export async function loadSmartbookExercise(bookId: string, exerciseId: string, className: string | null) {
  return loadExercise(bookId, exerciseId, publishedFor(className), false);
}

/** The same for a teacher: any active book, and each question's answer and worked solution included. */
export async function loadExerciseForTeacher(bookId: string, exerciseId: string) {
  return loadExercise(bookId, exerciseId, { isActive: true }, true);
}

async function loadExercise(bookId: string, exerciseId: string, bookWhere: Prisma.BookWhereInput, withAnswers: boolean) {
  const book = await prisma.book.findFirst({ where: { id: bookId, ...bookWhere }, select: { id: true, title: true, className: true } });
  if (!book) return null;
  const exercise = await prisma.bookExercise.findFirst({
    where: { id: exerciseId, chapter: { bookId } },
    select: { id: true, chapterId: true, startPage: true, endPage: true, code: true, title: true, sectionType: true, orderIndex: true, chapter: { select: { id: true, name: true, chapterNumber: true } } },
  });
  if (!exercise) return null;

  const candidates = await prisma.question.findMany({
    where: { bookId, ...approvedPublic, OR: [{ bookExerciseId: exercise.id }, { bookExerciseId: null, bookChapterId: exercise.chapterId }] },
    select: { id: true, content: true, type: true, options: true, printedNumber: true, sourcePageStart: true, createdAt: true, bookId: true, bookChapterId: true, bookExerciseId: true, correctAnswer: true, explanation: true },
  });
  const range = { id: exercise.id, chapterId: exercise.chapterId, bookId, startPage: exercise.startPage, endPage: exercise.endPage };
  const questions: SmartbookQuestion[] = inPrintedOrder(candidates.filter((q) => questionInExercise(q, range)))
    .map(({ id, content, type, options, printedNumber, sourcePageStart, correctAnswer, explanation }) => ({
      id, content, type, options, printedNumber, sourcePageStart,
      // Never part of what a student's page receives: they get these after answering.
      ...(withAnswers ? { correctAnswer, explanation } : {}),
    }));

  // Neighbouring exercises (in book order, with questions) for "previous / next".
  const outline = await outlineOf(bookId);
  const flat = outline.chapters.flatMap((c) => c.exercises.map((e) => ({ id: e.id, label: `${c.name} · ${e.label}` })));
  const at = flat.findIndex((e) => e.id === exercise.id);

  return {
    book,
    chapter: exercise.chapter,
    exercise: { id: exercise.id, label: exerciseLabel(exercise), startPage: exercise.startPage, endPage: exercise.endPage },
    pages: exercisePages(exercise),
    questions,
    previous: at > 0 ? flat[at - 1] : null,
    next: at >= 0 && at < flat.length - 1 ? flat[at + 1] : null,
  };
}

/** The stored image of one page of a published book, if that page is inside one of its exercises or sections. */
export async function smartbookPageImagePath(bookId: string, pageNumber: number, className: string | null): Promise<string | null> {
  return pageImagePath(bookId, pageNumber, publishedFor(className));
}

/** The same for a teacher: any active book, still only pages inside its exercises or sections. */
export async function teacherPageImagePath(bookId: string, pageNumber: number): Promise<string | null> {
  return pageImagePath(bookId, pageNumber, { isActive: true });
}

async function pageImagePath(bookId: string, pageNumber: number, bookWhere: Prisma.BookWhereInput): Promise<string | null> {
  const book = await prisma.book.findFirst({
    where: { id: bookId, ...bookWhere },
    select: { ingestionRuns: { orderBy: { createdAt: 'desc' }, take: 1, select: { sourceDocumentId: true } } },
  });
  const documentId = book?.ingestionRuns[0]?.sourceDocumentId;
  if (!documentId) return null;
  const inside = await prisma.bookExercise.count({ where: { chapter: { bookId }, startPage: { lte: pageNumber }, OR: [{ endPage: { gte: pageNumber } }, { endPage: null, startPage: pageNumber }] } });
  if (inside === 0) return null;
  const page = await prisma.documentPage.findFirst({ where: { documentId, pageNumber }, select: { processedImagePath: true, pageImagePath: true } });
  return page?.processedImagePath || page?.pageImagePath || null;
}
