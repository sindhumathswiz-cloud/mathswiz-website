import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { AUTO_SCORED_TYPES } from '@/lib/exam-scoring';
import { studentSmartbookAccess } from '@/lib/smartbook-data';

export const dynamic = 'force-dynamic';

/**
 * The answer and explanation of a Smartbook question. A question the app can mark (multiple choice, numerical) is
 * revealed only after the student has answered it; a written one ("prove that…") is self-checked, so its answer is
 * revealed on request. Only approved, public questions of a Smartbook the student can read.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id || session.user.role !== 'STUDENT') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const access = await studentSmartbookAccess(session.user.id);
  if (!access.premium) return NextResponse.json({ error: 'Smartbooks are part of Premium.' }, { status: 403 });

  const { id } = await params;
  const question = await prisma.question.findFirst({
    where: { id, status: 'APPROVED', scope: 'PUBLIC', book: { smartbookPublishedAt: { not: null }, isActive: true, className: access.className ?? '__no_class__' } },
    select: { id: true, type: true, correctAnswer: true, explanation: true },
  });
  if (!question) return NextResponse.json({ error: 'Question not found' }, { status: 404 });

  if (AUTO_SCORED_TYPES.includes(question.type)) {
    const answered = await prisma.testResponse.count({ where: { questionId: id, attempt: { userId: session.user.id } } });
    if (answered === 0) return NextResponse.json({ error: 'Answer the question first.' }, { status: 409 });
  }
  return NextResponse.json({ correctAnswer: question.correctAnswer, explanation: question.explanation });
}
