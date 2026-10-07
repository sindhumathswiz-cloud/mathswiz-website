import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { secondsRemaining } from '@/lib/exam-clock';

export const dynamic = 'force-dynamic';

/**
 * The student pressed "Start Examination": the clock starts now, on the server.
 * Idempotent, so a reload or a second tab gets the same start time and cannot
 * restart the clock.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const session = await getServerSession(authOptions);
    if (!session || (session.user as any).role !== 'STUDENT') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }
    const studentId = (session.user as any).id;
    const { attemptId } = await req.json().catch(() => ({}));

    const attempt = await prisma.testAttempt.findFirst({ where: { id: attemptId, userId: studentId, testId: id, status: 'IN_PROGRESS' } });
    if (!attempt) return NextResponse.json({ error: 'Attempt not found' }, { status: 404 });
    const test = await prisma.test.findUnique({ where: { id }, select: { duration: true } });
    if (!test) return NextResponse.json({ error: 'Test not found' }, { status: 404 });

    const now = new Date();
    // Only the first press sets the clock; later calls leave it alone.
    await prisma.testAttempt.updateMany({ where: { id: attempt.id, examStartedAt: null }, data: { examStartedAt: now } });
    const current = await prisma.testAttempt.findUniqueOrThrow({ where: { id: attempt.id } });

    return NextResponse.json({
      examStartedAt: current.examStartedAt,
      secondsRemaining: secondsRemaining(current, test.duration, now),
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
