import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { hasReachedStage, nextStageAfterQuizComplete } from '@/lib/learning-path';

export const dynamic = 'force-dynamic';

/**
 * Recomputes the quiz score SERVER-SIDE from MasteryEvent rows written by
 * the (already-server-verified) practice/submit calls the client made
 * during the quiz -- never trusts a client-submitted score/results, since
 * those calls already ran correctness through the same authoritative path
 * every other practice answer does.
 */
export async function POST(request: Request, { params }: { params: Promise<{ topic: string }> }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id || session.user.role !== 'STUDENT') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const studentId = session.user.id;
    const { topic: topicParam } = await params;
    const topic = decodeURIComponent(topicParam);

    const body = await request.json().catch(() => null);
    const questionIds = Array.isArray(body?.questionIds) ? body.questionIds.filter((id: unknown) => typeof id === 'string') : [];
    const startedAt = typeof body?.startedAt === 'string' ? new Date(body.startedAt) : null;
    if (questionIds.length === 0 || !startedAt || Number.isNaN(startedAt.getTime())) {
      return NextResponse.json({ error: 'questionIds and startedAt are required' }, { status: 400 });
    }

    const progress = await prisma.learningPathProgress.findUnique({
      where: { userId_topic: { userId: studentId, topic } },
    });
    if (!progress || !hasReachedStage(progress.stage, 'TIMED_QUIZ')) {
      return NextResponse.json({ error: 'This path has not reached the timed quiz yet' }, { status: 400 });
    }
    if (progress.stage !== 'TIMED_QUIZ') {
      return NextResponse.json({ success: true, progress });
    }

    // The ground truth: MasteryEvent rows practice/submit wrote for these
    // exact questions since the quiz started. A client claiming different
    // results is simply ignored.
    const events = await prisma.masteryEvent.findMany({
      where: { userId: studentId, questionId: { in: questionIds }, createdAt: { gte: startedAt } },
      orderBy: { createdAt: 'desc' },
    });
    const latestByQuestion = new Map<string, boolean>();
    for (const event of events) {
      if (!event.questionId || latestByQuestion.has(event.questionId)) continue;
      latestByQuestion.set(event.questionId, event.isCorrect);
    }

    const answeredCount = latestByQuestion.size;
    const correctCount = Array.from(latestByQuestion.values()).filter(Boolean).length;
    const missedQuestionIds = questionIds.filter((id: string) => latestByQuestion.get(id) !== true);
    const quizScore = questionIds.length > 0 ? Math.round((correctCount / questionIds.length) * 1000) / 10 : 0;

    const stage = nextStageAfterQuizComplete('TIMED_QUIZ', missedQuestionIds.length);
    const updated = await prisma.learningPathProgress.update({
      where: { userId_topic: { userId: studentId, topic } },
      data: {
        quizScore,
        recoveryQuestionIds: missedQuestionIds,
        stage,
        completedAt: stage === 'COMPLETED' ? new Date() : null,
      },
    });

    return NextResponse.json({ success: true, progress: updated, answeredCount, correctCount, totalQuestions: questionIds.length });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to complete quiz' }, { status: 500 });
  }
}
