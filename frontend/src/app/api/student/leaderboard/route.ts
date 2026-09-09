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
    const { searchParams } = new URL(req.url);
    const batchId = searchParams.get('batchId');

    // Get student's batches if not specified
    let targetBatchId = batchId;
    if (!targetBatchId) {
      const enrollments = await (prisma as any).batchEnrollment.findMany({
        where: { studentId, status: 'APPROVED' },
        select: { batchId: true },
        take: 1,
      });
      targetBatchId = enrollments[0]?.batchId;
    }

    const ownEnrollment = await (prisma as any).batchEnrollment.findFirst({
      where: { batchId: targetBatchId, studentId, status: 'APPROVED' },
      select: { id: true },
    });
    if (!ownEnrollment) {
      return NextResponse.json({ error: 'You are not enrolled in this batch' }, { status: 403 });
    }

    if (!targetBatchId) {
      return NextResponse.json({ success: true, leaderboard: [], userRank: null, totalStudents: 0 });
    }

    // Get all students in the batch
    const enrollments = await (prisma as any).batchEnrollment.findMany({
      where: { batchId: targetBatchId, status: 'APPROVED' },
      select: { studentId: true },
    });

    const studentIds = enrollments.map((e: any) => e.studentId);

    if (studentIds.length === 0) {
      return NextResponse.json({ success: true, leaderboard: [], userRank: null, totalStudents: 0 });
    }

    // Calculate scores for each student
    const leaderboard = await Promise.all(
      studentIds.map(async (studentId: string) => {
        // Get test attempts
        const attempts = await (prisma as any).testAttempt.findMany({
          where: { userId: studentId },
          select: { totalScore: true },
        });

        const avgTestScore = attempts.length > 0
          ? attempts.reduce((sum: number, a: any) => sum + (a.totalScore || 0), 0) / attempts.length
          : 0;

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

        // Get user info
        const user = await (prisma as any).user.findUnique({
          where: { id: studentId },
          select: { firstName: true, lastName: true, image: true },
        });

        // Combined score: test avg (60%) + points (30%) + streak (10%)
        const combinedScore = (avgTestScore * 0.6) + (totalPoints * 0.3) + ((progress?.currentStreak || 0) * 10 * 0.1);

        return {
          userId: studentId,
          name: user?.firstName ? `${user.firstName} ${user.lastName || ''}`.trim() : 'Student',
          image: user?.image,
          avgTestScore: Math.round(avgTestScore),
          totalPoints,
          streak: progress?.currentStreak || 0,
          testsCompleted: attempts.length,
          combinedScore: Math.round(combinedScore),
        };
      })
    );

    // Sort by combined score descending
    leaderboard.sort((a, b) => b.combinedScore - a.combinedScore);

    // Add rank
    const rankedLeaderboard = leaderboard.map((entry, index) => ({
      ...entry,
      rank: index + 1,
    }));

    // Find user's rank
    const userEntry = rankedLeaderboard.find((e) => e.userId === studentId);
    const userRank = userEntry?.rank || null;

    return NextResponse.json({
      success: true,
      leaderboard: rankedLeaderboard,
      userRank,
      totalStudents: rankedLeaderboard.length,
      batchId: targetBatchId,
    });
  } catch (error: any) {
    console.error('Error fetching leaderboard:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
