import { computePlatformStreak } from './streak';

type LeaderboardClient = {
  batch: { findUnique(args: unknown): Promise<{ leaderboardEnabled: boolean } | null> };
  batchEnrollment: { findMany(args: unknown): Promise<{ studentId: string }[]> };
  user: { findMany(args: unknown): Promise<{ id: string; firstName: string | null; lastName: string | null; image: string | null }[]> };
  testAttempt: { findMany(args: unknown): Promise<any[]> };
  studentProgress: { findMany(args: unknown): Promise<{ lastPracticedAt: Date | null }[]> };
  pointsTransaction: { aggregate(args: unknown): Promise<{ _sum: { points: number | null } }> };
};

export interface LeaderboardEntry {
  userId: string;
  name: string;
  image: string | null;
  avgAccuracy: number; // 0-100, normalized across real-test and practice-arena attempts
  totalPoints: number;
  streak: number;
  testsCompleted: number;
  combinedScore: number;
  rank: number;
}

export interface BatchLeaderboardResult {
  enabled: boolean;
  leaderboard: LeaderboardEntry[];
}

const ACCURACY_WEIGHT = 0.35;
const IMPROVEMENT_WEIGHT = 0.30;
const STREAK_WEIGHT = 0.15;
const POINTS_WEIGHT = 0.20;
const POINTS_CAP = 500; // points at/above this score the full 100 on the points term
const STREAK_CAP_DAYS = 10; // a streak at/above this scores the full 100 on the streak term

/**
 * Batch-scoped leaderboard, corrected from the original inline route logic:
 * - normalizes real-test scores (raw marks) and practice-arena accuracy onto
 *   the same 0-100 scale before averaging, instead of averaging raw
 *   TestAttempt.totalScore across both kinds (a single big mock previously
 *   swamped a batchmate who only did accurate practice-arena work)
 * - adds a normalized improvement term (last 5 vs prior 5 accuracy) and a
 *   normalized points term (previously un-normalized totalPoints could
 *   swamp everything for a high-point student)
 * - uses the platform-level streak (lib/streak.ts), not the unrelated
 *   per-topic StudentProgress.currentStreak
 *
 * `includeOptedOut` bypasses only the opt-in visibility filter (used
 * internally for TOP_SCORER badge eligibility, which shouldn't be gated
 * behind a privacy preference) -- it never bypasses a teacher's
 * excludedFromRankings moderation decision.
 */
export async function computeBatchLeaderboard(
  client: LeaderboardClient,
  batchId: string,
  options: { includeOptedOut?: boolean } = {}
): Promise<BatchLeaderboardResult> {
  const batch = await client.batch.findUnique({ where: { id: batchId }, select: { leaderboardEnabled: true } });
  if (!batch?.leaderboardEnabled) return { enabled: false, leaderboard: [] };

  const enrollments = await client.batchEnrollment.findMany({
    where: { batchId, status: 'APPROVED', excludedFromRankings: false },
    select: { studentId: true },
  });
  const candidateIds = enrollments.map((e) => e.studentId);
  if (candidateIds.length === 0) return { enabled: true, leaderboard: [] };

  const users = await client.user.findMany({
    where: { id: { in: candidateIds }, ...(options.includeOptedOut ? {} : { leaderboardOptIn: true }) },
    select: { id: true, firstName: true, lastName: true, image: true },
  });
  if (users.length === 0) return { enabled: true, leaderboard: [] };

  const entries = await Promise.all(users.map(async (user) => {
    const [realAttempts, practiceAttempts, pointsResult, streak] = await Promise.all([
      client.testAttempt.findMany({
        where: { userId: user.id, testId: { not: null }, status: 'SUBMITTED' },
        select: { totalScore: true, startTime: true, test: { select: { totalMarks: true } } },
        orderBy: { startTime: 'desc' },
      }),
      client.testAttempt.findMany({
        where: { userId: user.id, isPracticeArena: true, status: 'SUBMITTED' },
        select: { totalCorrect: true, totalIncorrect: true, startTime: true },
        orderBy: { startTime: 'desc' },
      }),
      client.pointsTransaction.aggregate({ where: { userId: user.id }, _sum: { points: true } }),
      computePlatformStreak(client, user.id),
    ]);

    const normalized = [
      ...realAttempts
        .filter((a: any) => (a.test?.totalMarks ?? 0) > 0)
        .map((a: any) => ({
          accuracyPct: Math.max(0, Math.min(100, (a.totalScore / a.test.totalMarks) * 100)),
          startTime: a.startTime as Date,
        })),
      ...practiceAttempts
        .filter((a: any) => a.totalCorrect + a.totalIncorrect > 0)
        .map((a: any) => ({
          accuracyPct: (a.totalCorrect / (a.totalCorrect + a.totalIncorrect)) * 100,
          startTime: a.startTime as Date,
        })),
    ].sort((a, b) => b.startTime.getTime() - a.startTime.getTime());

    const avgAccuracy = normalized.length > 0
      ? normalized.reduce((sum, a) => sum + a.accuracyPct, 0) / normalized.length
      : 0;

    const recent10 = normalized.slice(0, 10);
    const last5 = recent10.slice(0, 5);
    const prior5 = recent10.slice(5, 10);
    let improvementTerm = 50; // neutral midpoint with insufficient history to judge a trend
    if (last5.length > 0 && prior5.length > 0) {
      const last5Avg = last5.reduce((s, a) => s + a.accuracyPct, 0) / last5.length;
      const prior5Avg = prior5.reduce((s, a) => s + a.accuracyPct, 0) / prior5.length;
      const delta = Math.max(-20, Math.min(20, last5Avg - prior5Avg));
      improvementTerm = (delta + 20) * 2.5;
    }

    const totalPoints = pointsResult._sum.points || 0;
    const pointsTerm = Math.min(totalPoints, POINTS_CAP) / POINTS_CAP * 100;
    const streakTerm = Math.min(streak.currentStreak, STREAK_CAP_DAYS) / STREAK_CAP_DAYS * 100;

    const combinedScore =
      avgAccuracy * ACCURACY_WEIGHT +
      improvementTerm * IMPROVEMENT_WEIGHT +
      streakTerm * STREAK_WEIGHT +
      pointsTerm * POINTS_WEIGHT;

    return {
      userId: user.id,
      name: user.firstName ? `${user.firstName} ${user.lastName || ''}`.trim() : 'Student',
      image: user.image,
      avgAccuracy: Math.round(avgAccuracy),
      totalPoints,
      streak: streak.currentStreak,
      testsCompleted: normalized.length,
      combinedScore: Math.round(combinedScore),
    };
  }));

  entries.sort((a, b) => b.combinedScore - a.combinedScore);
  const leaderboard = entries.map((e, i) => ({ ...e, rank: i + 1 }));

  return { enabled: true, leaderboard };
}
