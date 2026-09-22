import { beforeEach, describe, expect, it, vi } from 'vitest';

const computePlatformStreak = vi.fn();
vi.mock('@/lib/streak', () => ({ computePlatformStreak }));

const computeBatchLeaderboard = vi.fn();
vi.mock('@/lib/leaderboard', () => ({ computeBatchLeaderboard }));

const pointsTransaction = { create: vi.fn(), aggregate: vi.fn(), findMany: vi.fn() };
const badge = { findUnique: vi.fn(), create: vi.fn() };
const userBadge = { findUnique: vi.fn(), create: vi.fn() };
const testAttempt = { count: vi.fn(), findMany: vi.fn() };
const testResponse = { count: vi.fn() };
const teacherQuery = { count: vi.fn() };
const studentProgress = { findFirst: vi.fn() };
const notification = { create: vi.fn() };
const batchEnrollment = { findMany: vi.fn() };

vi.mock('@/lib/prisma', () => ({
  default: { pointsTransaction, badge, userBadge, testAttempt, testResponse, teacherQuery, studentProgress, notification, batchEnrollment },
}));

function badgeId(name: string) {
  return `badge_${name.toLowerCase().replace(/\s+/g, '_')}`;
}

describe('gamification', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Every badge definition already exists -- skip the seed-on-demand loop.
    badge.findUnique.mockResolvedValue({ id: 'existing' });
    // Nothing earned yet by default.
    userBadge.findUnique.mockResolvedValue(null);
    userBadge.create.mockResolvedValue({});
    notification.create.mockResolvedValue({});
    pointsTransaction.create.mockResolvedValue({});
    pointsTransaction.aggregate.mockResolvedValue({ _sum: { points: 0 } });
    testAttempt.count.mockResolvedValue(0);
    testAttempt.findMany.mockResolvedValue([]);
    testResponse.count.mockResolvedValue(0);
    teacherQuery.count.mockResolvedValue(0);
    computePlatformStreak.mockResolvedValue({ currentStreak: 0, maxStreak: 0, totalActiveDays: 0, calendar: [] });
    batchEnrollment.findMany.mockResolvedValue([]);
    computeBatchLeaderboard.mockResolvedValue({ enabled: true, leaderboard: [] });
  });

  describe('STREAK criteria', () => {
    it('unlocks the 7-Day Streak badge off the platform streak, not the per-topic one', async () => {
      computePlatformStreak.mockResolvedValue({ currentStreak: 7, maxStreak: 7, totalActiveDays: 7, calendar: [] });
      const { awardPoints } = await import('./gamification');
      await awardPoints('student-1', 2, 'practice question');

      expect(userBadge.create).toHaveBeenCalledWith(expect.objectContaining({
        data: { userId: 'student-1', badgeId: badgeId('7-Day Streak') },
      }));
    });

    it('does NOT unlock a streak badge when the platform streak is broken, even if a stale per-topic StudentProgress.currentStreak is high (the bug this fix corrects)', async () => {
      // The old, buggy criteria read studentProgress.currentStreak (max
      // across topics) instead of the real platform streak -- simulate a
      // stale high per-topic value that should now be irrelevant.
      studentProgress.findFirst.mockResolvedValue({ currentStreak: 30 });
      computePlatformStreak.mockResolvedValue({ currentStreak: 2, maxStreak: 10, totalActiveDays: 2, calendar: [] });

      const { awardPoints } = await import('./gamification');
      await awardPoints('student-1', 2, 'practice question');

      const streakBadgeCalls = userBadge.create.mock.calls.filter(
        (c: any) => c[0].data.badgeId === badgeId('7-Day Streak') || c[0].data.badgeId === badgeId('30-Day Warrior')
      );
      expect(streakBadgeCalls).toHaveLength(0);
      // Proves the fix actually changed the data source, not just the number.
      expect(studentProgress.findFirst).not.toHaveBeenCalled();
    });

    it('awards the PRACTICE_STREAK_7 bonus exactly once, at the same moment the badge unlocks', async () => {
      computePlatformStreak.mockResolvedValue({ currentStreak: 7, maxStreak: 7, totalActiveDays: 7, calendar: [] });
      const { awardPoints, POINTS_RULES } = await import('./gamification');
      await awardPoints('student-1', 2, 'practice question');

      const bonusCalls = pointsTransaction.create.mock.calls.filter(
        (c: any) => c[0].data.points === POINTS_RULES.PRACTICE_STREAK_7
      );
      expect(bonusCalls).toHaveLength(1);
    });

    it('does not re-award the streak bonus once the badge is already earned', async () => {
      userBadge.findUnique.mockImplementation(async ({ where }: any) =>
        where.userId_badgeId.badgeId === badgeId('7-Day Streak') ? { userId: 'student-1', badgeId: badgeId('7-Day Streak') } : null
      );
      computePlatformStreak.mockResolvedValue({ currentStreak: 7, maxStreak: 7, totalActiveDays: 7, calendar: [] });
      const { awardPoints, POINTS_RULES } = await import('./gamification');
      await awardPoints('student-1', 2, 'practice question');

      const bonusCalls = pointsTransaction.create.mock.calls.filter(
        (c: any) => c[0].data.points === POINTS_RULES.PRACTICE_STREAK_7
      );
      expect(bonusCalls).toHaveLength(0);
    });
  });

  describe('PERFECT_SCORE criteria', () => {
    it('does not unlock for a raw totalScore of exactly 100 on a test worth more than 100 marks (the old, wrong check)', async () => {
      testAttempt.findMany.mockResolvedValue([{ totalScore: 100, test: { totalMarks: 400 } }]);
      const { awardPoints } = await import('./gamification');
      await awardPoints('student-1', 10, 'test completed');

      const perfectCalls = userBadge.create.mock.calls.filter((c: any) => c[0].data.badgeId === badgeId('Perfect Score'));
      expect(perfectCalls).toHaveLength(0);
    });

    it('unlocks when totalScore equals the test\'s own totalMarks (true full marks)', async () => {
      testAttempt.findMany.mockResolvedValue([{ totalScore: 78, test: { totalMarks: 78 } }]);
      const { awardPoints } = await import('./gamification');
      await awardPoints('student-1', 10, 'test completed');

      const perfectCalls = userBadge.create.mock.calls.filter((c: any) => c[0].data.badgeId === badgeId('Perfect Score'));
      expect(perfectCalls).toHaveLength(1);
    });

    it('ignores practice-arena attempts (testId null) entirely', async () => {
      const { awardPoints } = await import('./gamification');
      await awardPoints('student-1', 2, 'practice question');

      expect(testAttempt.findMany).toHaveBeenCalledWith(expect.objectContaining({
        where: { userId: 'student-1', testId: { not: null } },
      }));
    });
  });

  describe('TOP_SCORER criteria', () => {
    it('unlocks when the student ranks #1 in one of their approved batches', async () => {
      batchEnrollment.findMany.mockResolvedValue([{ batchId: 'batch-1' }]);
      computeBatchLeaderboard.mockResolvedValue({
        enabled: true,
        leaderboard: [{ userId: 'student-1', rank: 1, combinedScore: 90 }, { userId: 'other', rank: 2, combinedScore: 80 }],
      });
      const { awardPoints } = await import('./gamification');
      await awardPoints('student-1', 10, 'test completed');

      expect(computeBatchLeaderboard).toHaveBeenCalledWith(expect.anything(), 'batch-1', { includeOptedOut: true });
      const topScorerCalls = userBadge.create.mock.calls.filter((c: any) => c[0].data.badgeId === badgeId('Batch Topper'));
      expect(topScorerCalls).toHaveLength(1);
    });

    it('unlocks even when the student opted out of the public leaderboard (eligibility is not gated by visibility)', async () => {
      batchEnrollment.findMany.mockResolvedValue([{ batchId: 'batch-1' }]);
      // includeOptedOut:true is what the mock receives -- proves gamification.ts
      // requested the eligibility variant, not the public-visibility one.
      computeBatchLeaderboard.mockImplementation(async (_client: any, _batchId: any, options: any) => {
        expect(options).toEqual({ includeOptedOut: true });
        return { enabled: true, leaderboard: [{ userId: 'student-1', rank: 1, combinedScore: 90 }] };
      });
      const { awardPoints } = await import('./gamification');
      await awardPoints('student-1', 10, 'test completed');

      const topScorerCalls = userBadge.create.mock.calls.filter((c: any) => c[0].data.badgeId === badgeId('Batch Topper'));
      expect(topScorerCalls).toHaveLength(1);
    });

    it('does not unlock when the student is not ranked #1', async () => {
      batchEnrollment.findMany.mockResolvedValue([{ batchId: 'batch-1' }]);
      computeBatchLeaderboard.mockResolvedValue({
        enabled: true,
        leaderboard: [{ userId: 'other', rank: 1, combinedScore: 90 }, { userId: 'student-1', rank: 2, combinedScore: 80 }],
      });
      const { awardPoints } = await import('./gamification');
      await awardPoints('student-1', 10, 'test completed');

      const topScorerCalls = userBadge.create.mock.calls.filter((c: any) => c[0].data.badgeId === badgeId('Batch Topper'));
      expect(topScorerCalls).toHaveLength(0);
    });
  });

  describe('skips already-earned badges', () => {
    it('never calls userBadge.create again for a badge already earned', async () => {
      userBadge.findUnique.mockResolvedValue({ userId: 'student-1', badgeId: badgeId('First Steps') });
      testAttempt.count.mockResolvedValue(5);
      const { awardPoints } = await import('./gamification');
      await awardPoints('student-1', 10, 'test completed');

      expect(userBadge.create).not.toHaveBeenCalled();
    });
  });
});
