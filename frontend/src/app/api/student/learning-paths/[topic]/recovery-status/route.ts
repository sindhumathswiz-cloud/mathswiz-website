import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { nextStageAfterRecoveryCheck } from '@/lib/learning-path';

export const dynamic = 'force-dynamic';

/**
 * Recomputes recoveryQuestionIds against live MasteryEvent state -- a
 * question the student has since answered correctly again drops out --
 * and flips the path to COMPLETED once none remain. Called on the recovery
 * page's load/poll rather than requiring a separate "mark resolved" action.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ topic: string }> }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id || session.user.role !== 'STUDENT') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const studentId = session.user.id;
    const { topic: topicParam } = await params;
    const topic = decodeURIComponent(topicParam);

    const progress = await prisma.learningPathProgress.findUnique({
      where: { userId_topic: { userId: studentId, topic } },
    });
    if (!progress) {
      return NextResponse.json({ error: 'No progress for this topic yet' }, { status: 404 });
    }
    if (progress.stage !== 'RECOVERY_PRACTICE') {
      return NextResponse.json({ progress });
    }

    const remaining: string[] = [];
    for (const questionId of progress.recoveryQuestionIds) {
      const latest = await prisma.masteryEvent.findFirst({
        where: { userId: studentId, questionId },
        orderBy: { createdAt: 'desc' },
        select: { isCorrect: true },
      });
      if (!latest?.isCorrect) remaining.push(questionId);
    }

    const stage = nextStageAfterRecoveryCheck('RECOVERY_PRACTICE', remaining.length);
    const updated = await prisma.learningPathProgress.update({
      where: { userId_topic: { userId: studentId, topic } },
      data: {
        recoveryQuestionIds: remaining,
        stage,
        completedAt: stage === 'COMPLETED' ? new Date() : null,
      },
    });

    return NextResponse.json({ progress: updated });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to check recovery status' }, { status: 500 });
  }
}
