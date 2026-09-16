import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';

export const dynamic = 'force-dynamic';

/**
 * Lists every topic that has at least one worked-example-eligible question
 * (APPROVED + explanation populated), merged with the caller's own
 * LearningPathProgress. Topics with no progress row yet synthesize a
 * default EXAMPLES view without writing to the DB (write-on-first-
 * interaction, not write-on-list).
 */
export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id || session.user.role !== 'STUDENT') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const studentId = session.user.id;

    const [topicRows, progressRows] = await Promise.all([
      prisma.question.findMany({
        where: { status: 'APPROVED', scope: 'PUBLIC', topic: { not: null }, explanation: { not: null } },
        distinct: ['topic'],
        select: { topic: true },
      }),
      prisma.learningPathProgress.findMany({ where: { userId: studentId } }),
    ]);

    const progressByTopic = new Map(progressRows.map((p) => [p.topic, p]));
    const paths = topicRows
      .filter((t): t is { topic: string } => !!t.topic)
      .map(({ topic }) => {
        const progress = progressByTopic.get(topic);
        return {
          topic,
          stage: progress?.stage ?? 'EXAMPLES',
          examplesViewedCount: progress?.examplesViewedCount ?? 0,
          guidedAttempted: progress?.guidedAttempted ?? 0,
          guidedCorrect: progress?.guidedCorrect ?? 0,
          quizScore: progress?.quizScore ?? null,
          recoveryRemaining: progress?.recoveryQuestionIds.length ?? 0,
          startedAt: progress?.startedAt ?? null,
          completedAt: progress?.completedAt ?? null,
        };
      });

    return NextResponse.json({ paths });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to load learning paths' }, { status: 500 });
  }
}
