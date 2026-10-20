import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { requirePremiumTeacher } from '@/lib/teacher-api-guard';

export const dynamic = 'force-dynamic';

/** A teacher's bookmarked questions (TeacherFavorite), newest first, with what a list needs to show them. */
export async function GET() {
  const session = await getServerSession(authOptions);
  const guard = await requirePremiumTeacher(session);
  if (!guard.ok) return guard.response;
  const favorites = await prisma.teacherFavorite.findMany({ where: { teacherId: guard.userId }, orderBy: { createdAt: 'desc' }, select: { questionId: true, createdAt: true } });
  const questions = favorites.length ? await prisma.question.findMany({
    where: { id: { in: favorites.map((f) => f.questionId) }, OR: [{ status: 'APPROVED', scope: 'PUBLIC' }, { createdById: guard.userId }] },
    select: {
      id: true, content: true, type: true, options: true, correctAnswer: true, explanation: true, printedNumber: true, sourcePageStart: true, topic: true,
      book: { select: { id: true, title: true } }, bookChapter: { select: { name: true } },
    },
  }) : [];
  const byId = new Map(questions.map((q) => [q.id, q]));
  // Keep the bookmark order; a question that is no longer available drops out of the list.
  return NextResponse.json({ questions: favorites.map((f) => byId.get(f.questionId)).filter(Boolean) });
}

/** Bookmark a question: { questionId }. Idempotent. */
export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  const guard = await requirePremiumTeacher(session);
  if (!guard.ok) return guard.response;
  const body = await request.json().catch(() => null);
  const questionId = typeof body?.questionId === 'string' ? body.questionId : '';
  if (!questionId) return NextResponse.json({ error: 'questionId is required' }, { status: 400 });
  const visible = await prisma.question.count({ where: { id: questionId, OR: [{ status: 'APPROVED', scope: 'PUBLIC' }, { createdById: guard.userId }] } });
  if (!visible) return NextResponse.json({ error: 'Question not found' }, { status: 404 });
  await prisma.teacherFavorite.upsert({
    where: { teacherId_questionId: { teacherId: guard.userId, questionId } },
    update: {},
    create: { teacherId: guard.userId, questionId },
  });
  return NextResponse.json({ bookmarked: true });
}

/** Remove a bookmark: ?questionId=… */
export async function DELETE(request: Request) {
  const session = await getServerSession(authOptions);
  const guard = await requirePremiumTeacher(session);
  if (!guard.ok) return guard.response;
  const questionId = new URL(request.url).searchParams.get('questionId');
  if (!questionId) return NextResponse.json({ error: 'questionId is required' }, { status: 400 });
  await prisma.teacherFavorite.deleteMany({ where: { teacherId: guard.userId, questionId } });
  return NextResponse.json({ bookmarked: false });
}
