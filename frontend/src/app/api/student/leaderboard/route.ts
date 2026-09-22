import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { computeBatchLeaderboard } from '@/lib/leaderboard';

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

    let targetBatchId = batchId;
    if (!targetBatchId) {
      const enrollments = await (prisma as any).batchEnrollment.findMany({
        where: { studentId, status: 'APPROVED' },
        select: { batchId: true },
        take: 1,
      });
      targetBatchId = enrollments[0]?.batchId;
    }

    if (!targetBatchId) {
      return NextResponse.json({ success: true, leaderboard: [], userRank: null, totalStudents: 0, enabled: false, optedIn: false });
    }

    const ownEnrollment = await (prisma as any).batchEnrollment.findFirst({
      where: { batchId: targetBatchId, studentId, status: 'APPROVED' },
      select: { id: true },
    });
    if (!ownEnrollment) {
      return NextResponse.json({ error: 'You are not enrolled in this batch' }, { status: 403 });
    }

    const [viewer, result] = await Promise.all([
      (prisma as any).user.findUnique({ where: { id: studentId }, select: { leaderboardOptIn: true } }),
      computeBatchLeaderboard(prisma as any, targetBatchId),
    ]);

    const userEntry = result.leaderboard.find((e) => e.userId === studentId);

    return NextResponse.json({
      success: true,
      enabled: result.enabled,
      optedIn: Boolean(viewer?.leaderboardOptIn),
      leaderboard: result.leaderboard,
      userRank: userEntry?.rank ?? null,
      totalStudents: result.leaderboard.length,
      batchId: targetBatchId,
    });
  } catch (error: any) {
    console.error('Error fetching leaderboard:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
