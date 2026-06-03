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

    // Get all test attempts for the last 90 days
    const ninetyDaysAgo = new Date();
    ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

    const attempts = await (prisma as any).testAttempt.findMany({
      where: {
        userId,
        startTime: { gte: ninetyDaysAgo },
      },
      select: { startTime: true },
    });

    // Get practice activity
    const practice = await (prisma as any).studentProgress.findMany({
      where: { userId },
      select: { lastPracticedAt: true },
    });

    // Build a set of active dates
    const activeDates = new Set<string>();

    attempts.forEach((a: any) => {
      const date = new Date(a.startTime);
      activeDates.add(date.toISOString().split('T')[0]);
    });

    practice.forEach((p: any) => {
      if (p.lastPracticedAt) {
        const date = new Date(p.lastPracticedAt);
        activeDates.add(date.toISOString().split('T')[0]);
      }
    });

    // Calculate current streak
    let currentStreak = 0;
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    for (let i = 0; i < 365; i++) {
      const checkDate = new Date(today);
      checkDate.setDate(checkDate.getDate() - i);
      const dateStr = checkDate.toISOString().split('T')[0];

      if (activeDates.has(dateStr)) {
        currentStreak++;
      } else if (i > 0) {
        break;
      }
    }

    // Build calendar data for last 30 days
    const calendar = [];
    for (let i = 29; i >= 0; i--) {
      const date = new Date(today);
      date.setDate(date.getDate() - i);
      const dateStr = date.toISOString().split('T')[0];

      calendar.push({
        date: dateStr,
        isActive: activeDates.has(dateStr),
        dayOfWeek: date.getDay(),
      });
    }

    // Get max streak ever
    const allAttempts = await (prisma as any).testAttempt.findMany({
      where: { userId },
      select: { startTime: true },
      orderBy: { startTime: 'asc' },
    });

    let maxStreak = 0;
    let tempStreak = 0;
    let lastDate: Date | null = null;

    allAttempts.forEach((a: any) => {
      const attemptDate = new Date(a.startTime);
      attemptDate.setHours(0, 0, 0, 0);

      if (lastDate) {
        const diffDays = Math.floor((attemptDate.getTime() - lastDate.getTime()) / (1000 * 60 * 60 * 24));
        if (diffDays === 1) {
          tempStreak++;
        } else if (diffDays > 1) {
          tempStreak = 1;
        }
      } else {
        tempStreak = 1;
      }

      maxStreak = Math.max(maxStreak, tempStreak);
      lastDate = attemptDate;
    });

    return NextResponse.json({
      success: true,
      currentStreak,
      maxStreak,
      calendar,
      totalActiveDays: activeDates.size,
    });
  } catch (error: any) {
    console.error('Error fetching streak data:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
