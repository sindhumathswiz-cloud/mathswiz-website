import { beforeEach, describe, expect, it, vi } from 'vitest';
import { computeBatchLeaderboard } from './leaderboard';

const batch = { findUnique: vi.fn() };
const batchEnrollment = { findMany: vi.fn() };
const user = { findMany: vi.fn() };
const testAttempt = { findMany: vi.fn() };
const studentProgress = { findMany: vi.fn() };
const pointsTransaction = { aggregate: vi.fn() };

const client = { batch, batchEnrollment, user, testAttempt, studentProgress, pointsTransaction };

// Fixture data per student, keyed by userId, consulted by the testAttempt
// mock below based on which of the three call shapes computeBatchLeaderboard
// / computePlatformStreak makes.
let realAttemptsByStudent: Record<string, any[]> = {};
let practiceAttemptsByStudent: Record<string, any[]> = {};
let pointsByStudent: Record<string, number> = {};

beforeEach(() => {
  vi.clearAllMocks();
  realAttemptsByStudent = {};
  practiceAttemptsByStudent = {};
  pointsByStudent = {};

  batch.findUnique.mockResolvedValue({ leaderboardEnabled: true });
  studentProgress.findMany.mockResolvedValue([]);

  testAttempt.findMany.mockImplementation(async ({ where, orderBy }: any) => {
    const userId = where.userId;
    if (where.testId) return realAttemptsByStudent[userId] ?? [];
    if (where.isPracticeArena) return practiceAttemptsByStudent[userId] ?? [];
    // Remaining shapes are lib/streak.ts's own two queries -- no attempt
    // history needed for these tests (streak stays 0 for everyone).
    if (where.startTime) return [];
    if (orderBy?.startTime === 'asc') return [];
    return [];
  });

  pointsTransaction.aggregate.mockImplementation(async ({ where }: any) => ({
    _sum: { points: pointsByStudent[where.userId] ?? null },
  }));
});

describe('computeBatchLeaderboard', () => {
  it('returns enabled:false and an empty leaderboard when the batch has not turned it on', async () => {
    batch.findUnique.mockResolvedValue({ leaderboardEnabled: false });
    const result = await computeBatchLeaderboard(client, 'batch-1');
    expect(result).toEqual({ enabled: false, leaderboard: [] });
    expect(batchEnrollment.findMany).not.toHaveBeenCalled();
  });

  it('excludes students not opted in by default', async () => {
    batchEnrollment.findMany.mockResolvedValue([{ studentId: 'a' }, { studentId: 'b' }]);
    user.findMany.mockImplementation(async ({ where }: any) => {
      // leaderboardOptIn:true is applied when includeOptedOut is not set
      expect(where.leaderboardOptIn).toBe(true);
      return [{ id: 'a', firstName: 'A', lastName: '', image: null }];
    });
    const result = await computeBatchLeaderboard(client, 'batch-1');
    expect(result.leaderboard.map((e) => e.userId)).toEqual(['a']);
  });

  it('always filters excludedFromRankings students at the enrollment level, even with includeOptedOut', async () => {
    batchEnrollment.findMany.mockResolvedValue([]);
    user.findMany.mockResolvedValue([]);
    await computeBatchLeaderboard(client, 'batch-1', { includeOptedOut: true });
    expect(batchEnrollment.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ excludedFromRankings: false }),
    }));
  });

  it('does not filter by leaderboardOptIn when includeOptedOut is true', async () => {
    batchEnrollment.findMany.mockResolvedValue([{ studentId: 'a' }]);
    user.findMany.mockImplementation(async ({ where }: any) => {
      expect(where.leaderboardOptIn).toBeUndefined();
      return [{ id: 'a', firstName: 'A', lastName: '', image: null }];
    });
    await computeBatchLeaderboard(client, 'batch-1', { includeOptedOut: true });
  });

  it('a raw-marks-heavy real-test student does not dominate a high-accuracy practice-only student (the normalization fix)', async () => {
    batchEnrollment.findMany.mockResolvedValue([{ studentId: 'raw-marks-heavy' }, { studentId: 'practice-accurate' }]);
    user.findMany.mockResolvedValue([
      { id: 'raw-marks-heavy', firstName: 'Heavy', lastName: '', image: null },
      { id: 'practice-accurate', firstName: 'Accurate', lastName: '', image: null },
    ]);
    // 320/400 marks = 80% accuracy, but a huge raw number under the old (buggy) formula.
    realAttemptsByStudent['raw-marks-heavy'] = [
      { totalScore: 320, startTime: new Date(), test: { totalMarks: 400 } },
    ];
    // 9/10 correct = 90% accuracy, but a tiny raw number (0/1 per question) under the old formula.
    practiceAttemptsByStudent['practice-accurate'] = [
      { totalCorrect: 9, totalIncorrect: 1, startTime: new Date() },
    ];

    const result = await computeBatchLeaderboard(client, 'batch-1');
    const heavy = result.leaderboard.find((e) => e.userId === 'raw-marks-heavy')!;
    const accurate = result.leaderboard.find((e) => e.userId === 'practice-accurate')!;

    expect(heavy.avgAccuracy).toBe(80);
    expect(accurate.avgAccuracy).toBe(90);
    // Higher accuracy must outrank despite far smaller raw marks.
    expect(accurate.combinedScore).toBeGreaterThan(heavy.combinedScore);
    expect(result.leaderboard[0].userId).toBe('practice-accurate');
  });

  it('normalizes totalPoints instead of letting a high-point student swamp the score', async () => {
    batchEnrollment.findMany.mockResolvedValue([{ studentId: 'a' }, { studentId: 'b' }]);
    user.findMany.mockResolvedValue([
      { id: 'a', firstName: 'A', lastName: '', image: null },
      { id: 'b', firstName: 'B', lastName: '', image: null },
    ]);
    pointsByStudent['a'] = 5000; // far above the normalization cap
    pointsByStudent['b'] = 500;  // at the cap
    const result = await computeBatchLeaderboard(client, 'batch-1');
    const a = result.leaderboard.find((e) => e.userId === 'a')!;
    const b = result.leaderboard.find((e) => e.userId === 'b')!;
    // Both should land at the same capped points term -> identical combinedScore here.
    expect(a.combinedScore).toBe(b.combinedScore);
  });

  it('sorts descending by combinedScore and assigns sequential ranks', async () => {
    batchEnrollment.findMany.mockResolvedValue([{ studentId: 'a' }, { studentId: 'b' }]);
    user.findMany.mockResolvedValue([
      { id: 'a', firstName: 'A', lastName: '', image: null },
      { id: 'b', firstName: 'B', lastName: '', image: null },
    ]);
    pointsByStudent['a'] = 100;
    pointsByStudent['b'] = 0;
    const result = await computeBatchLeaderboard(client, 'batch-1');
    expect(result.leaderboard.map((e) => e.rank)).toEqual([1, 2]);
    expect(result.leaderboard[0].userId).toBe('a');
  });
});
