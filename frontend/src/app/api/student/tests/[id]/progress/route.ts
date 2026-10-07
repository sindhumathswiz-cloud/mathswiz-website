import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { isPastGrace } from '@/lib/exam-clock';

export const dynamic = 'force-dynamic';

const MAX_BYTES = 1_000_000;

/**
 * Saves the student's answers on the server while the clock runs. It is what lets
 * a paper that is submitted late be scored from the answers given in time, and it
 * lets a student pick the paper up on another device.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const session = await getServerSession(authOptions);
    if (!session || (session.user as any).role !== 'STUDENT') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }
    const studentId = (session.user as any).id;
    const raw = await req.text();
    if (raw.length > MAX_BYTES) return NextResponse.json({ error: 'Too large' }, { status: 413 });
    let body: any;
    try { body = JSON.parse(raw); } catch { return NextResponse.json({ error: 'Invalid body' }, { status: 400 }); }
    const { attemptId, responses } = body ?? {};
    if (!responses || typeof responses !== 'object' || Array.isArray(responses)) {
      return NextResponse.json({ error: 'responses must be an object' }, { status: 400 });
    }

    const attempt = await prisma.testAttempt.findFirst({ where: { id: attemptId, userId: studentId, testId: id, status: 'IN_PROGRESS' } });
    if (!attempt) return NextResponse.json({ error: 'Attempt not found' }, { status: 404 });
    const test = await prisma.test.findUnique({ where: { id }, select: { duration: true } });
    if (!test) return NextResponse.json({ error: 'Test not found' }, { status: 404 });

    const now = new Date();
    // Nothing saved after the clock and its grace have run out: that is the point of the copy.
    if (!attempt.examStartedAt || isPastGrace(attempt, test.duration, now)) {
      return NextResponse.json({ saved: false, reason: attempt.examStartedAt ? 'TIME_UP' : 'NOT_STARTED' }, { status: 409 });
    }

    await prisma.testAttempt.update({ where: { id: attempt.id }, data: { savedResponses: responses, savedAt: now } });
    return NextResponse.json({ saved: true, savedAt: now });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
