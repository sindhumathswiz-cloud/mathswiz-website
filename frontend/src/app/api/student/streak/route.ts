import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { computePlatformStreak } from '@/lib/streak';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const userId = (session.user as any).id;
    const streak = await computePlatformStreak(prisma as any, userId);

    return NextResponse.json({ success: true, ...streak });
  } catch (error: any) {
    console.error('Error fetching streak data:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
