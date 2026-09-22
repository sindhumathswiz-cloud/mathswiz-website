import { describe, expect, it, vi } from 'vitest';
import { computePlatformStreak } from './streak';

// Mirrors computePlatformStreak's own anchor exactly (local midnight, then
// subtract days) so fixture dates land in the same ISO-date buckets the
// function's own checkDate/calendar construction does, regardless of the
// host timezone's UTC offset.
const daysAgo = (d: number) => {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() - d);
  return date;
};

function makeClient(attemptDays: number[], practiceDays: number[] = []) {
  return {
    testAttempt: {
      findMany: vi.fn(async ({ orderBy }: any) => {
        const rows = attemptDays.map((d) => ({ startTime: daysAgo(d) }));
        if (orderBy?.startTime === 'asc') rows.reverse();
        return rows;
      }),
    },
    studentProgress: {
      findMany: vi.fn(async () => practiceDays.map((d) => ({ lastPracticedAt: daysAgo(d) }))),
    },
  };
}

describe('computePlatformStreak', () => {
  it('counts a currentStreak of 0 when there is a gap ending yesterday', async () => {
    // active today missing, active 2 days ago -- streak should be 0 (today not active, and i>0 break stops immediately after)
    const client = makeClient([2, 3, 4]);
    const result = await computePlatformStreak(client, 'student-1');
    expect(result.currentStreak).toBe(0);
  });

  it('counts an unbroken currentStreak ending today', async () => {
    const client = makeClient([0, 1, 2]);
    const result = await computePlatformStreak(client, 'student-1');
    expect(result.currentStreak).toBe(3);
  });

  it('unions test-attempt days with studentProgress.lastPracticedAt days for currentStreak', async () => {
    // attempt today, practice-only yesterday, attempt 2 days ago -- streak of 3 via the union
    const client = makeClient([0, 2], [1]);
    const result = await computePlatformStreak(client, 'student-1');
    expect(result.currentStreak).toBe(3);
  });

  it('computes maxStreak from TestAttempt dates only, ignoring a longer practice-only run', async () => {
    // 5-day attempt streak long ago, plus unrelated single practice day -- maxStreak should reflect the 5-day attempt run
    const client = makeClient([10, 11, 12, 13, 14], [50]);
    const result = await computePlatformStreak(client, 'student-1');
    expect(result.maxStreak).toBe(5);
  });

  it('returns a 30-day calendar with correct isActive flags', async () => {
    const client = makeClient([0, 5]);
    const result = await computePlatformStreak(client, 'student-1');
    expect(result.calendar).toHaveLength(30);
    expect(result.calendar[29].isActive).toBe(true); // today
    expect(result.calendar[29 - 5].isActive).toBe(true); // 5 days ago
    expect(result.calendar[29 - 1].isActive).toBe(false); // yesterday, not active
  });

  it('totalActiveDays reflects the deduped union set size', async () => {
    const client = makeClient([0, 1], [1, 2]); // day 1 overlaps
    const result = await computePlatformStreak(client, 'student-1');
    expect(result.totalActiveDays).toBe(3);
  });
});
