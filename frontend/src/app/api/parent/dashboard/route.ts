import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { masterySummary } from '@/lib/mastery-view';

export const dynamic = 'force-dynamic';

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Per-child enrichment for the parent dashboard: weekly learning time,
 * strengths/risks (reusing lib/mastery-view.ts), teacher comments, plus the
 * attendance/streak/rank metrics the old route already attempted but got
 * wrong -- it queried TestAttempt.studentId/.score, neither of which exist
 * (the real fields are userId/totalScore). Rewritten here with the correct
 * fields and batched (not N+1) rank/recent-score queries.
 */
export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id || session.user.role !== 'PARENT') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const studentId = searchParams.get('studentId');
  if (!studentId) return NextResponse.json({ error: 'studentId is required' }, { status: 400 });

  const link = await prisma.parentLink.findFirst({ where: { parentId: session.user.id, studentId } });
  if (!link) return NextResponse.json({ error: 'Student not linked to this account' }, { status: 403 });

  try {
    const weekAgo = new Date(Date.now() - WEEK_MS);

    const [
      weeklyResponses,
      completedThisWeek,
      progress,
      responseComments,
      interventionComments,
      attendanceRecords,
      allSubmittedAttempts,
      recentAttempts,
      enrollments,
    ] = await Promise.all([
      prisma.testResponse.findMany({
        where: { attempt: { userId: studentId, startTime: { gte: weekAgo } } },
        select: { timeSpent: true },
      }),
      prisma.testAttempt.count({
        where: { userId: studentId, status: 'SUBMITTED', startTime: { gte: weekAgo } },
      }),
      prisma.studentProgress.findMany({ where: { userId: studentId } }),
      prisma.testResponse.findMany({
        where: { attempt: { userId: studentId }, teacherFeedback: { not: null } },
        select: { teacherFeedback: true, reviewedAt: true, attempt: { select: { test: { select: { title: true } } } } },
        orderBy: { reviewedAt: 'desc' },
        take: 10,
      }),
      prisma.intervention.findMany({
        where: { studentId, outcomeNotes: { not: null } },
        select: { id: true, title: true, outcomeNotes: true, updatedAt: true },
        orderBy: { updatedAt: 'desc' },
        take: 10,
      }),
      prisma.attendanceRecord.findMany({ where: { studentId } }),
      prisma.testAttempt.findMany({
        where: { userId: studentId, status: 'SUBMITTED' },
        select: { startTime: true },
      }),
      prisma.testAttempt.findMany({
        where: { userId: studentId, status: 'SUBMITTED' },
        orderBy: { endTime: 'desc' },
        take: 5,
        select: { testId: true, totalScore: true, endTime: true, startTime: true },
      }),
      prisma.batchEnrollment.findMany({ where: { studentId, status: 'APPROVED' }, select: { batchId: true } }),
    ]);

    const weeklyTimeSpentMinutes = Math.round(weeklyResponses.reduce((sum, r) => sum + r.timeSpent, 0) / 60);

    const { average: masteryAverage, needsSupport, developing, secure } = masterySummary(
      progress.map((p) => ({ topic: p.topic, masteryScore: p.masteryScore }))
    );

    const teacherComments = [
      ...responseComments.map((r, i) => ({
        id: `response-${i}`,
        source: 'test' as const,
        title: r.attempt.test?.title || 'Test response',
        comment: r.teacherFeedback!,
        at: r.reviewedAt,
      })),
      ...interventionComments.map((iv) => ({
        id: `intervention-${iv.id}`,
        source: 'intervention' as const,
        title: iv.title,
        comment: iv.outcomeNotes!,
        at: iv.updatedAt,
      })),
    ]
      .sort((a, b) => new Date(b.at ?? 0).getTime() - new Date(a.at ?? 0).getTime())
      .slice(0, 8);

    const presentCount = attendanceRecords.filter((r) => r.status === 'PRESENT').length;
    const attendancePercent = attendanceRecords.length > 0 ? Math.round((presentCount / attendanceRecords.length) * 100) : null;

    // Streak: consecutive days with a SUBMITTED attempt, scanning back from today.
    const attemptDays = new Set(allSubmittedAttempts.map((a) => new Date(a.startTime).toDateString()));
    let currentStreak = 0;
    for (let i = 0; i < 365; i++) {
      const day = new Date();
      day.setDate(day.getDate() - i);
      if (attemptDays.has(day.toDateString())) currentStreak++;
      else if (i > 0) break;
    }

    // Batch rank percentile among approved peers, by avg SUBMITTED totalScore.
    // Batched groupBy instead of the old per-peer N+1 loop.
    let globalRank: number | null = null;
    if (enrollments.length > 0) {
      const batchIds = enrollments.map((e) => e.batchId);
      const peers = await prisma.batchEnrollment.findMany({
        where: { batchId: { in: batchIds }, status: 'APPROVED' },
        select: { studentId: true },
        distinct: ['studentId'],
      });
      const peerIds = peers.map((p) => p.studentId);
      const averages = await prisma.testAttempt.groupBy({
        by: ['userId'],
        where: { userId: { in: peerIds }, status: 'SUBMITTED' },
        _avg: { totalScore: true },
      });
      const avgById = new Map(averages.map((a) => [a.userId, a._avg.totalScore ?? 0]));
      const childAvg = avgById.get(studentId) ?? 0;
      const better = [...avgById.entries()].filter(([id, avg]) => id !== studentId && avg > childAvg).length;
      globalRank = peerIds.length > 0 ? Math.round(((peerIds.length - better) / peerIds.length) * 100) : null;
    }

    // Recent scores with batch average, batched (not the old per-attempt N+1).
    const testIds = [...new Set(recentAttempts.map((a) => a.testId).filter((id): id is string => !!id))];
    const [batchAverages, tests] = await Promise.all([
      testIds.length > 0
        ? prisma.testAttempt.groupBy({ by: ['testId'], where: { testId: { in: testIds }, status: 'SUBMITTED' }, _avg: { totalScore: true } })
        : Promise.resolve([] as { testId: string | null; _avg: { totalScore: number | null } }[]),
      testIds.length > 0 ? prisma.test.findMany({ where: { id: { in: testIds } }, select: { id: true, title: true } }) : Promise.resolve([]),
    ]);
    const batchAvgByTest = new Map(batchAverages.map((b) => [b.testId, b._avg.totalScore ?? 0]));
    const testTitleById = new Map(tests.map((t) => [t.id, t.title]));
    const recentScores = recentAttempts.map((a) => ({
      test: (a.testId && testTitleById.get(a.testId)) || 'Practice Arena Session',
      score: a.totalScore,
      avg: Math.round((a.testId ? batchAvgByTest.get(a.testId) : 0) ?? 0),
      date: new Date(a.endTime || a.startTime).toLocaleDateString('en-IN'),
    }));

    return NextResponse.json({
      success: true,
      stats: {
        weeklyTimeSpentMinutes,
        completedThisWeek,
        strengths: secure.map((s) => s.topic),
        risks: needsSupport.map((s) => s.topic),
        developing: developing.map((s) => s.topic),
        masteryAverage,
        teacherComments,
        attendancePercent,
        currentStreak,
        globalRank,
        recentScores,
      },
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to load dashboard' }, { status: 500 });
  }
}
