import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { revalidatePath } from 'next/cache';
import { awardPoints, POINTS_RULES } from '@/lib/gamification';
import { applyMasteryUpdate } from '@/lib/mastery';

export const dynamic = 'force-dynamic';

const IDEMPOTENCY_WINDOW_MS = 30_000;

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    const sessionUser = session?.user as { id?: string; role?: string } | undefined;
    if (!sessionUser?.id || sessionUser.role !== 'STUDENT') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    const body = await req.json();
    const questionId = typeof body.questionId === 'string' ? body.questionId.trim() : '';
    const skipped = body.skipped === true;
    const selectedOption = body.selectedOption == null ? '' : String(body.selectedOption).trim();
    const rawTimeSpent = Number(body.timeSpent);
    const timeSpent = Number.isFinite(rawTimeSpent)
      ? Math.max(0, Math.min(Math.floor(rawTimeSpent), 86_400))
      : 0;

    if (!questionId || (!skipped && !selectedOption)) {
      return NextResponse.json({ error: 'questionId and selectedOption are required' }, { status: 400 });
    }

    // Public questions are answerable once APPROVED (the general bank) or
    // PENDING_REVIEW (freshly AI-generated for this student by
    // /practice/generate, not yet vetted for the shared /practice/next pool
    // — the requesting student can still practice it and earn mastery/points
    // for their own attempt; only a teacher/admin approval makes it visible
    // to other students). Fetching the answer here also ensures correctness
    // never depends on a client claim.
    const question = await prisma.question.findFirst({
      where: { id: questionId, status: { in: ['APPROVED', 'PENDING_REVIEW'] }, scope: 'PUBLIC' },
      select: { id: true, correctAnswer: true, topic: true, difficulty: true },
    });
    if (!question) {
      return NextResponse.json({ error: 'Question not found or unavailable' }, { status: 404 });
    }
    if (!skipped && question.correctAnswer == null) {
      return NextResponse.json({ error: 'Question has no answer configured' }, { status: 422 });
    }

    const isCorrect = !skipped && selectedOption === String(question.correctAnswer).trim();
    const studentId = sessionUser.id;
    const now = new Date();
    const recentThreshold = new Date(now.getTime() - IDEMPOTENCY_WINDOW_MS);

    const result = await prisma.$transaction(async (tx) => {
      // The schema has no request-id unique key. This bounded replay check makes
      // ordinary browser/network retries idempotent, though a unique key would
      // be required for a strict guarantee under concurrent requests.
      const existing = await tx.testAttempt.findFirst({
        where: {
          userId: studentId,
          isPracticeArena: true,
          status: 'SUBMITTED',
          endTime: { gte: recentThreshold },
          responses: skipped
            ? { some: { questionId, status: 'SKIPPED' } }
            : { some: { questionId, selectedOption } },
        },
        include: { responses: true },
        orderBy: { endTime: 'desc' },
      });
      if (existing) return { attempt: existing, created: false };

      const attempt = await tx.testAttempt.create({
        data: {
          userId: studentId,
          testId: null,
          isPracticeArena: true,
          status: 'SUBMITTED',
          startTime: new Date(now.getTime() - timeSpent * 1000),
          endTime: now,
          totalScore: isCorrect ? 1 : 0,
          totalCorrect: isCorrect ? 1 : 0,
          totalIncorrect: skipped ? 0 : (isCorrect ? 0 : 1),
          totalSkipped: skipped ? 1 : 0,
          responses: {
            create: {
              questionId,
              selectedOption: skipped ? null : selectedOption,
              isCorrect,
              marksAwarded: isCorrect ? 1 : 0,
              timeSpent,
              status: skipped ? 'SKIPPED' : 'ANSWERED',
            },
          },
        },
        include: { responses: true },
      });

      // A skip carries no correctness signal, so it neither helps nor hurts
      // mastery — only a real attempt updates it.
      if (question.topic && !skipped) {
        await applyMasteryUpdate(tx, { userId: studentId, topic: question.topic, isCorrect, source: 'PRACTICE', difficulty: question.difficulty, attemptId: attempt.id, questionId, at: now });
      }

      return { attempt, created: true };
    }, { isolationLevel: 'Serializable' });

    if (result.created && !skipped) {
      await awardPoints(studentId, POINTS_RULES.PRACTICE_QUESTION, 'Practice question completed', { questionId, isCorrect });
      if (isCorrect) await awardPoints(studentId, 3, 'Correct answer', { questionId });
    }

    revalidatePath('/student', 'layout');
    return NextResponse.json({
      success: true,
      attempt: result.attempt,
      isCorrect,
      duplicate: !result.created,
      pointsAwarded: result.created && !skipped ? (isCorrect ? 5 : 2) : 0,
    });
  } catch (error: unknown) {
    console.error('Practice Save Error:', error);
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to save practice response' }, { status: 500 });
  }
}
