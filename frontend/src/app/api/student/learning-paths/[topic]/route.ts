import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { examplesRequiredFor } from '@/lib/learning-path';

export const dynamic = 'force-dynamic';

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
    const stage = progress?.stage ?? 'EXAMPLES';

    const exampleQuestions = await prisma.question.findMany({
      where: { topic, status: 'APPROVED', scope: 'PUBLIC', explanation: { not: null } },
      select: { id: true, content: true, explanation: true, difficulty: true },
      take: 10,
    });

    const payload: Record<string, unknown> = {
      topic,
      stage,
      examplesRequired: examplesRequiredFor(exampleQuestions.length),
      examplesViewedCount: progress?.examplesViewedCount ?? 0,
      examplesViewedIds: progress?.examplesViewedIds ?? [],
      examples: exampleQuestions,
      guidedAttempted: progress?.guidedAttempted ?? 0,
      guidedCorrect: progress?.guidedCorrect ?? 0,
      quizScore: progress?.quizScore ?? null,
      recoveryQuestionIds: progress?.recoveryQuestionIds ?? [],
      completedAt: progress?.completedAt ?? null,
    };

    return NextResponse.json(payload);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to load learning path' }, { status: 500 });
  }
}
