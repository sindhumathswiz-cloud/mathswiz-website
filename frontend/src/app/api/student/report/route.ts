import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const studentId = (session.user as any).id;

    // Get student info
    const student = await (prisma as any).user.findUnique({
      where: { id: studentId },
      select: { firstName: true, lastName: true, email: true, mobileNumber: true },
    });

    // Get test attempts
    const attempts = await (prisma as any).testAttempt.findMany({
      where: { userId: studentId, status: 'SUBMITTED' },
      include: { test: { select: { title: true } } },
      orderBy: { startTime: 'desc' },
      take: 20,
    });

    // Calculate test stats
    const totalTests = attempts.length;
    const avgScore = totalTests > 0
      ? attempts.reduce((sum: number, a: any) => sum + (a.totalScore || 0), 0) / totalTests
      : 0;
    const totalCorrect = attempts.reduce((sum: number, a: any) => sum + (a.totalCorrect || 0), 0);
    const totalIncorrect = attempts.reduce((sum: number, a: any) => sum + (a.totalIncorrect || 0), 0);

    // Get points
    const pointsResult = await (prisma as any).pointsTransaction.aggregate({
      where: { userId: studentId },
      _sum: { points: true },
    });
    const totalPoints = pointsResult._sum.points || 0;

    // Get streak
    const progress = await (prisma as any).studentProgress.findFirst({
      where: { userId: studentId },
      orderBy: { currentStreak: 'desc' },
      select: { currentStreak: true },
    });

    // Get badges
    const userBadges = await (prisma as any).userBadge.count({
      where: { userId: studentId },
    });

    // Get topic analysis
    const responses = await (prisma as any).testResponse.findMany({
      where: { attempt: { userId: studentId, status: 'SUBMITTED' } },
      include: { question: { select: { topic: true } } },
    });

    const topicStats: Record<string, { correct: number; total: number }> = {};
    responses.forEach((r: any) => {
      const topic = r.question?.topic || 'General';
      if (!topicStats[topic]) topicStats[topic] = { correct: 0, total: 0 };
      topicStats[topic].total++;
      if (r.isCorrect) topicStats[topic].correct++;
    });

    const topics = Object.entries(topicStats).map(([topic, stats]) => ({
      topic,
      confidence: stats.total > 0 ? Math.round((stats.correct / stats.total) * 100) : 0,
      totalQuestions: stats.total,
    }));

    // Attendance
    const attendance = await (prisma as any).attendance.findMany({
      where: { userId: studentId },
      orderBy: { date: 'desc' },
      take: 30,
    });

    const presentDays = attendance.filter((a: any) => a.status === 'PRESENT').length;
    const attendanceRate = attendance.length > 0
      ? Math.round((presentDays / attendance.length) * 100)
      : 0;

    return NextResponse.json({
      success: true,
      student: {
        name: `${student?.firstName || ''} ${student?.lastName || ''}`.trim(),
        email: student?.email,
        mobile: student?.mobileNumber,
      },
      stats: {
        totalTests,
        avgScore: Math.round(avgScore),
        totalCorrect,
        totalIncorrect,
        accuracy: totalCorrect + totalIncorrect > 0
          ? Math.round((totalCorrect / (totalCorrect + totalIncorrect)) * 100)
          : 0,
        totalPoints,
        currentStreak: progress?.currentStreak || 0,
        badgesEarned: userBadges,
        attendanceRate,
        presentDays,
        totalDays: attendance.length,
      },
      topics,
      recentTests: attempts.slice(0, 10).map((a: any) => ({
        title: a.test?.title || 'Untitled Test',
        score: a.totalScore,
        correct: a.totalCorrect,
        incorrect: a.totalIncorrect,
        date: a.startTime,
      })),
      generatedAt: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error('Error generating report:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
