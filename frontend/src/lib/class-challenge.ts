export type ClassChallengeMetric = 'MOST_PRACTICE' | 'MASTERY_GAIN' | 'POINTS_EARNED';

type ClassChallengeClient = {
  batchEnrollment: { findMany(args: unknown): Promise<{ studentId: string }[]> };
  user: { findMany(args: unknown): Promise<{ id: string; firstName: string | null; lastName: string | null; image: string | null }[]> };
  testResponse: { count(args: unknown): Promise<number> };
  masteryEvent: { aggregate(args: unknown): Promise<{ _sum: { delta: number | null } }> };
  pointsTransaction: { aggregate(args: unknown): Promise<{ _sum: { points: number | null } }> };
};

export interface ChallengeRankEntry {
  userId: string;
  name: string;
  image: string | null;
  value: number;
  rank: number;
}

interface ChallengeWindow {
  batchId: string;
  metric: ClassChallengeMetric;
  startDate: Date;
  endDate: Date;
}

/**
 * Live-computed ranking for a class challenge's window, same "no stored
 * snapshot" shape as computeBatchLeaderboard -- reads a table that already
 * exists rather than accumulating a running total.
 *
 * Reuses BatchEnrollment.excludedFromRankings as the moderation lever (same
 * concept as the leaderboard: a teacher can hide a student's entry without
 * unenrolling them). Deliberately does not respect leaderboardOptIn --
 * class challenges are teacher-run and batch-scoped, not the public,
 * opt-in leaderboard.
 */
export async function computeChallengeRanking(
  client: ClassChallengeClient,
  challenge: ChallengeWindow
): Promise<ChallengeRankEntry[]> {
  const enrollments = await client.batchEnrollment.findMany({
    where: { batchId: challenge.batchId, status: 'APPROVED', excludedFromRankings: false },
    select: { studentId: true },
  });
  const candidateIds = enrollments.map((e) => e.studentId);
  if (candidateIds.length === 0) return [];

  const users = await client.user.findMany({
    where: { id: { in: candidateIds } },
    select: { id: true, firstName: true, lastName: true, image: true },
  });

  const window = { gte: challenge.startDate, lte: challenge.endDate };

  const entries = await Promise.all(users.map(async (user) => {
    let value = 0;
    switch (challenge.metric) {
      case 'MOST_PRACTICE': {
        value = await client.testResponse.count({
          where: { attempt: { userId: user.id, isPracticeArena: true, startTime: window } },
        });
        break;
      }
      case 'MASTERY_GAIN': {
        const result = await client.masteryEvent.aggregate({
          where: { userId: user.id, delta: { gt: 0 }, createdAt: window },
          _sum: { delta: true },
        });
        value = result._sum.delta || 0;
        break;
      }
      case 'POINTS_EARNED': {
        const result = await client.pointsTransaction.aggregate({
          where: { userId: user.id, createdAt: window },
          _sum: { points: true },
        });
        value = result._sum.points || 0;
        break;
      }
    }

    return {
      userId: user.id,
      name: user.firstName ? `${user.firstName} ${user.lastName || ''}`.trim() : 'Student',
      image: user.image,
      value,
    };
  }));

  entries.sort((a, b) => b.value - a.value);
  return entries.map((e, i) => ({ ...e, rank: i + 1 }));
}
