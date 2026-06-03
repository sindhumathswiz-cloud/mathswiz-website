import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getUserTotalPoints, getUserPointsHistory } from '@/lib/gamification';
import prisma from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const userId = (session.user as any).id;
    const { searchParams } = new URL(req.url);
    const type = searchParams.get('type') || 'summary';

    if (type === 'summary') {
      const totalPoints = await getUserTotalPoints(userId);
      const history = await getUserPointsHistory(userId, 10);
      const badgeCount = await (prisma as any).userBadge.count({
        where: { userId },
      });

      return NextResponse.json({
        success: true,
        points: totalPoints,
        badges: badgeCount,
        recentTransactions: history,
      });
    }

    if (type === 'history') {
      const limit = parseInt(searchParams.get('limit') || '50');
      const history = await getUserPointsHistory(userId, limit);
      return NextResponse.json({ success: true, history });
    }

    return NextResponse.json({ error: 'Invalid type' }, { status: 400 });
  } catch (error: any) {
    console.error('Error fetching points:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
