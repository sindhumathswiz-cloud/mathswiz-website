import { describe, expect, it, vi, beforeEach } from 'vitest';
import { computeChallengeRanking } from './class-challenge';

function makeClient(overrides: Partial<Record<string, any>> = {}) {
  return {
    batchEnrollment: { findMany: vi.fn().mockResolvedValue([{ studentId: 'a' }, { studentId: 'b' }]) },
    user: {
      findMany: vi.fn().mockResolvedValue([
        { id: 'a', firstName: 'Alice', lastName: null, image: null },
        { id: 'b', firstName: 'Bob', lastName: null, image: null },
      ]),
    },
    testResponse: { count: vi.fn().mockResolvedValue(0) },
    masteryEvent: { aggregate: vi.fn().mockResolvedValue({ _sum: { delta: null } }) },
    pointsTransaction: { aggregate: vi.fn().mockResolvedValue({ _sum: { points: null } }) },
    ...overrides,
  };
}

const window = { batchId: 'batch-1', startDate: new Date('2026-09-01'), endDate: new Date('2026-09-07') };

describe('computeChallengeRanking', () => {
  beforeEach(() => vi.clearAllMocks());

  it('excludes students the teacher marked excludedFromRankings (the enrollment query filter itself)', async () => {
    const client = makeClient();
    await computeChallengeRanking(client, { ...window, metric: 'POINTS_EARNED' });

    expect(client.batchEnrollment.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ excludedFromRankings: false, status: 'APPROVED' }),
    }));
  });

  it('returns an empty ranking when no enrollments are eligible', async () => {
    const client = makeClient({ batchEnrollment: { findMany: vi.fn().mockResolvedValue([]) } });
    const result = await computeChallengeRanking(client, { ...window, metric: 'POINTS_EARNED' });
    expect(result).toEqual([]);
  });

  it('MOST_PRACTICE counts practice-arena TestResponses within the window, ranked descending', async () => {
    const client = makeClient({
      testResponse: {
        count: vi.fn().mockImplementation(async ({ where }: any) =>
          where.attempt.userId === 'a' ? 12 : 5
        ),
      },
    });
    const result = await computeChallengeRanking(client, { ...window, metric: 'MOST_PRACTICE' });

    expect(client.testResponse.count).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        attempt: expect.objectContaining({ isPracticeArena: true, startTime: { gte: window.startDate, lte: window.endDate } }),
      }),
    }));
    expect(result[0]).toMatchObject({ userId: 'a', value: 12, rank: 1 });
    expect(result[1]).toMatchObject({ userId: 'b', value: 5, rank: 2 });
  });

  it('MASTERY_GAIN sums only positive deltas within the window', async () => {
    const client = makeClient({
      masteryEvent: {
        aggregate: vi.fn().mockImplementation(async ({ where }: any) =>
          where.userId === 'a' ? { _sum: { delta: 40 } } : { _sum: { delta: 10 } }
        ),
      },
    });
    const result = await computeChallengeRanking(client, { ...window, metric: 'MASTERY_GAIN' });

    expect(client.masteryEvent.aggregate).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ delta: { gt: 0 }, createdAt: { gte: window.startDate, lte: window.endDate } }),
    }));
    expect(result[0]).toMatchObject({ userId: 'a', value: 40 });
  });

  it('POINTS_EARNED sums PointsTransaction.points within the window', async () => {
    const client = makeClient({
      pointsTransaction: {
        aggregate: vi.fn().mockImplementation(async ({ where }: any) =>
          where.userId === 'b' ? { _sum: { points: 100 } } : { _sum: { points: 20 } }
        ),
      },
    });
    const result = await computeChallengeRanking(client, { ...window, metric: 'POINTS_EARNED' });

    expect(result[0]).toMatchObject({ userId: 'b', value: 100, rank: 1 });
  });

  it('defaults a null aggregate sum to 0 rather than throwing', async () => {
    const client = makeClient();
    const result = await computeChallengeRanking(client, { ...window, metric: 'POINTS_EARNED' });
    expect(result.every((e) => e.value === 0)).toBe(true);
  });
});
