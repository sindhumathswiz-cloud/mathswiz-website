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

    const userId = (session.user as any).id;
    const { searchParams } = new URL(req.url);
    const type = searchParams.get('type') || 'earned';

    if (type === 'earned') {
      const userBadges = await (prisma as any).userBadge.findMany({
        where: { userId },
        include: { badge: true },
        orderBy: { awardedAt: 'desc' },
      });

      return NextResponse.json({ success: true, badges: userBadges });
    }

    if (type === 'all') {
      const allBadges = await (prisma as any).badge.findMany({
        orderBy: [{ category: 'asc' }, { points: 'desc' }],
      });

      const earnedBadgeIds = await (prisma as any).userBadge.findMany({
        where: { userId },
        select: { badgeId: true },
      });

      const earnedSet = new Set(earnedBadgeIds.map((ub: any) => ub.badgeId));

      const badges = allBadges.map((badge: any) => ({
        ...badge,
        isEarned: earnedSet.has(badge.id),
        earnedAt: earnedBadgeIds.find((ub: any) => ub.badgeId === badge.id)?.awardedAt,
      }));

      return NextResponse.json({ success: true, badges });
    }

    return NextResponse.json({ error: 'Invalid type' }, { status: 400 });
  } catch (error: any) {
    console.error('Error fetching badges:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
