type StreakClient = {
  testAttempt: { findMany(args: unknown): Promise<{ startTime: Date }[]> };
  studentProgress: { findMany(args: unknown): Promise<{ lastPracticedAt: Date | null }[]> };
};

export interface PlatformStreak {
  currentStreak: number;
  maxStreak: number;
  totalActiveDays: number;
  calendar: { date: string; isActive: boolean; dayOfWeek: number }[];
}

/**
 * The one platform-level, cross-topic streak a student actually sees
 * (originally inline in api/student/streak/route.ts, extracted here so
 * lib/gamification.ts's badge-unlock logic can share it instead of reading
 * the unrelated per-topic StudentProgress.currentStreak). Takes a
 * client/tx param, same convention as lib/mastery.ts's applyMasteryUpdate.
 *
 * Note: maxStreak intentionally only considers TestAttempt dates (not the
 * practice-activity union currentStreak/calendar use) -- preserved exactly
 * as the original inline logic computed it, not changed as part of this
 * extraction.
 */
export async function computePlatformStreak(client: StreakClient, userId: string): Promise<PlatformStreak> {
  const ninetyDaysAgo = new Date();
  ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

  const attempts = await client.testAttempt.findMany({
    where: { userId, startTime: { gte: ninetyDaysAgo } },
    select: { startTime: true },
  });

  const practice = await client.studentProgress.findMany({
    where: { userId },
    select: { lastPracticedAt: true },
  });

  const activeDates = new Set<string>();
  attempts.forEach((a) => {
    activeDates.add(new Date(a.startTime).toISOString().split('T')[0]);
  });
  practice.forEach((p) => {
    if (p.lastPracticedAt) activeDates.add(new Date(p.lastPracticedAt).toISOString().split('T')[0]);
  });

  let currentStreak = 0;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  for (let i = 0; i < 365; i++) {
    const checkDate = new Date(today);
    checkDate.setDate(checkDate.getDate() - i);
    const dateStr = checkDate.toISOString().split('T')[0];
    if (activeDates.has(dateStr)) currentStreak++;
    else if (i > 0) break;
  }

  const calendar: PlatformStreak['calendar'] = [];
  for (let i = 29; i >= 0; i--) {
    const date = new Date(today);
    date.setDate(date.getDate() - i);
    const dateStr = date.toISOString().split('T')[0];
    calendar.push({ date: dateStr, isActive: activeDates.has(dateStr), dayOfWeek: date.getDay() });
  }

  const allAttempts = await client.testAttempt.findMany({
    where: { userId },
    select: { startTime: true },
    orderBy: { startTime: 'asc' },
  });

  let maxStreak = 0;
  let tempStreak = 0;
  let lastDate: Date | null = null;
  allAttempts.forEach((a) => {
    const attemptDate = new Date(a.startTime);
    attemptDate.setHours(0, 0, 0, 0);
    if (lastDate) {
      const diffDays = Math.floor((attemptDate.getTime() - lastDate.getTime()) / (1000 * 60 * 60 * 24));
      if (diffDays === 1) tempStreak++;
      else if (diffDays > 1) tempStreak = 1;
    } else {
      tempStreak = 1;
    }
    maxStreak = Math.max(maxStreak, tempStreak);
    lastDate = attemptDate;
  });

  return { currentStreak, maxStreak, totalActiveDays: activeDates.size, calendar };
}
