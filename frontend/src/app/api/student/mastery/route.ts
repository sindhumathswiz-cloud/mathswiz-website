import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';

// Time spent per question is display-only here -- it does NOT feed into
// applyMasteryUpdate()'s scoring formula (see lib/mastery.ts), so this is a
// read-only aggregation with no migration/backfill risk on existing
// StudentProgress/MasteryEvent rows.
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id || session.user.role !== 'STUDENT') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const [topics, history, responses] = await Promise.all([
    prisma.studentProgress.findMany({ where: { userId: session.user.id }, orderBy: [{ masteryScore: 'asc' }, { topic: 'asc' }] }),
    prisma.masteryEvent.findMany({ where: { userId: session.user.id }, orderBy: { createdAt: 'desc' }, take: 200, select: { id: true, topic: true, source: true, previousScore: true, newScore: true, delta: true, isCorrect: true, createdAt: true } }),
    // Prisma can't groupBy a related table's field directly, so aggregate
    // avg time-per-question by topic in app code. Capped at 2000 most
    // recent responses as a safety bound against unbounded history.
    prisma.testResponse.findMany({
      where: { attempt: { userId: session.user.id }, status: 'ANSWERED' },
      select: { timeSpent: true, question: { select: { topic: true } } },
      orderBy: { id: 'desc' },
      take: 2000,
    }),
  ]);

  const timeByTopic = new Map<string, { totalSeconds: number; count: number }>();
  for (const r of responses) {
    const topic = r.question?.topic;
    if (!topic) continue;
    const agg = timeByTopic.get(topic) ?? { totalSeconds: 0, count: 0 };
    agg.totalSeconds += r.timeSpent;
    agg.count += 1;
    timeByTopic.set(topic, agg);
  }

  const topicsWithTime = topics.map((t) => {
    const agg = timeByTopic.get(t.topic);
    return {
      ...t,
      avgTimeSeconds: agg && agg.count > 0 ? Math.round((agg.totalSeconds / agg.count) * 10) / 10 : null,
      attemptsCount: agg?.count ?? 0,
    };
  });

  return NextResponse.json({ topics: topicsWithTime, history });
}
