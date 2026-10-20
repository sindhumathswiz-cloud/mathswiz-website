import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { requirePremiumTeacher } from '@/lib/teacher-api-guard';
import { exerciseLabel, questionInExercise } from '@/lib/question-source-filter';
import { inPrintedOrder } from '@/lib/smartbook';

export const dynamic = 'force-dynamic';

/** Minutes allowed per question, and the floor, for a test made from an exercise; the teacher can change it later. */
const MINUTES_PER_QUESTION = 3;
const MIN_DURATION = 15;

/**
 * Makes a test from one exercise of a book: every approved, public question in it, in printed order, one mark each
 * and no negative marking. Returned unpublished; the teacher publishes and assigns it (as a test or as homework) on
 * the assign screen.
 */
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  const guard = await requirePremiumTeacher(session);
  if (!guard.ok) return guard.response;

  const { id } = await params;
  const exercise = await prisma.bookExercise.findUnique({
    where: { id },
    select: {
      id: true, chapterId: true, code: true, title: true, sectionType: true, startPage: true, endPage: true,
      chapter: { select: { id: true, name: true, bookId: true, book: { select: { title: true, className: true } } } },
    },
  });
  if (!exercise) return NextResponse.json({ error: 'Exercise not found' }, { status: 404 });

  const bookId = exercise.chapter.bookId;
  const candidates = await prisma.question.findMany({
    where: {
      bookId, status: 'APPROVED', scope: 'PUBLIC',
      OR: [{ bookExerciseId: exercise.id }, { bookExerciseId: null, bookChapterId: exercise.chapterId }],
    },
    select: { id: true, bookId: true, bookChapterId: true, bookExerciseId: true, sourcePageStart: true, printedNumber: true, createdAt: true },
  });
  const range = { id: exercise.id, chapterId: exercise.chapterId, bookId, startPage: exercise.startPage, endPage: exercise.endPage };
  const questions = inPrintedOrder(candidates.filter((q) => questionInExercise(q, range)));
  if (questions.length === 0) return NextResponse.json({ error: 'This exercise has no approved questions yet.' }, { status: 409 });

  const label = exerciseLabel(exercise);
  const test = await prisma.test.create({
    data: {
      title: `${exercise.chapter.name} · ${label}`,
      description: `${exercise.chapter.book.title}, ${exercise.chapter.name}: ${label}${exercise.startPage != null ? ` (p. ${exercise.startPage}${exercise.endPage != null && exercise.endPage !== exercise.startPage ? `–${exercise.endPage}` : ''})` : ''}`,
      class: exercise.chapter.book.className,
      mode: 'STRICT',
      duration: Math.max(MIN_DURATION, questions.length * MINUTES_PER_QUESTION),
      totalMarks: questions.length,
      isPublished: false,
      createdById: guard.userId,
      sections: {
        create: [{
          title: label,
          marksPerQuestion: 1,
          negativeMarks: 0,
          questions: { create: questions.map((q, index) => ({ questionId: q.id, orderIndex: index })) },
        }],
      },
    },
    select: { id: true, title: true },
  });
  return NextResponse.json({ test, questionCount: questions.length }, { status: 201 });
}
