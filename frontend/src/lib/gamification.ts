import prisma from "@/lib/prisma";
import { computePlatformStreak } from "@/lib/streak";
import { computeBatchLeaderboard } from "@/lib/leaderboard";

// Points rules for different actions
export const POINTS_RULES = {
  TEST_COMPLETED: 10,
  TEST_PERFECT_SCORE: 25,
  TEST_TOP_SCORER: 50,
  PRACTICE_QUESTION: 2,
  PRACTICE_STREAK_7: 50,
  PRACTICE_STREAK_30: 200,
  DOUBT_ASKED: 1,
  DOUBT_RESOLVED: 5,
  MATERIAL_DOWNLOADED: 1,
  PERFECT_ATTENDANCE_WEEK: 30,
  BATCH_JOIN: 5,
  PEER_CHALLENGE_WIN: 15,
  PEER_CHALLENGE_PARTICIPATE: 5,
  DAILY_LOGIN: 1,
} as const;

export async function awardPoints(userId: string, points: number, reason: string, metadata?: Record<string, any>) {
  try {
    await (prisma as any).pointsTransaction.create({
      data: {
        userId,
        points,
        reason,
        metadata: metadata || null,
      },
    });

    // Check for badge unlocks after awarding points
    await checkBadgeUnlocks(userId);

    return { success: true, points };
  } catch (error) {
    console.error("Error awarding points:", error);
    return { success: false, error };
  }
}

export async function getUserTotalPoints(userId: string) {
  try {
    const result = await (prisma as any).pointsTransaction.aggregate({
      where: { userId },
      _sum: { points: true },
    });

    return result._sum.points || 0;
  } catch (error) {
    console.error("Error fetching user points:", error);
    return 0;
  }
}

export async function getUserPointsHistory(userId: string, limit: number = 20) {
  try {
    return await (prisma as any).pointsTransaction.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  } catch (error) {
    console.error("Error fetching points history:", error);
    return [];
  }
}

// Badge definitions for auto-unlock
const BADGE_DEFINITIONS = [
  {
    name: "First Steps",
    description: "Completed your first test",
    icon: "footprints",
    category: "achievement",
    points: 10,
    criteria: { type: "TEST_COMPLETED", count: 1 },
    isSecret: false,
  },
  {
    name: "Perfect Score",
    description: "Scored full marks on a test",
    icon: "target",
    category: "achievement",
    points: 25,
    criteria: { type: "PERFECT_SCORE" },
    isSecret: false,
  },
  {
    name: "7-Day Streak",
    description: "Practiced for 7 consecutive days",
    icon: "flame",
    category: "milestone",
    points: 50,
    criteria: { type: "STREAK", count: 7 },
    isSecret: false,
  },
  {
    name: "30-Day Warrior",
    description: "Practiced for 30 consecutive days",
    icon: "sword",
    category: "milestone",
    points: 200,
    criteria: { type: "STREAK", count: 30 },
    isSecret: false,
  },
  {
    name: "Batch Topper",
    description: "Ranked #1 in your batch",
    icon: "trophy",
    category: "achievement",
    points: 100,
    criteria: { type: "TOP_SCORER" },
    isSecret: false,
  },
  {
    name: "Bookworm",
    description: "Completed 50 practice questions",
    icon: "book",
    category: "milestone",
    points: 30,
    criteria: { type: "PRACTICE_COUNT", count: 50 },
    isSecret: false,
  },
  {
    name: "Doubt Crusher",
    description: "Asked 10 doubts",
    icon: "message-circle",
    category: "achievement",
    points: 15,
    criteria: { type: "DOUBT_COUNT", count: 10 },
    isSecret: false,
  },
  {
    name: "Century Club",
    description: "Earned 100+ points",
    icon: "zap",
    category: "special",
    points: 0,
    criteria: { type: "POINTS_TOTAL", count: 100 },
    isSecret: true,
  },
  {
    name: "Point Master",
    description: "Earned 500+ points",
    icon: "crown",
    category: "special",
    points: 0,
    criteria: { type: "POINTS_TOTAL", count: 500 },
    isSecret: true,
  },
  {
    name: "Legend",
    description: "Earned 1000+ points",
    icon: "star",
    category: "special",
    points: 0,
    criteria: { type: "POINTS_TOTAL", count: 1000 },
    isSecret: true,
  },
];

async function checkBadgeUnlocks(userId: string) {
  try {
    // Ensure all badge definitions exist in DB
    for (const def of BADGE_DEFINITIONS) {
      const existing = await (prisma as any).badge.findUnique({
        where: { id: `badge_${def.name.toLowerCase().replace(/\s+/g, '_')}` },
      });

      if (!existing) {
        await (prisma as any).badge.create({
          data: {
            id: `badge_${def.name.toLowerCase().replace(/\s+/g, '_')}`,
            ...def,
          },
        });
      }
    }

    // Check each badge for unlock
    for (const def of BADGE_DEFINITIONS) {
      const badgeId = `badge_${def.name.toLowerCase().replace(/\s+/g, '_')}`;
      
      // Skip if already earned
      const alreadyEarned = await (prisma as any).userBadge.findUnique({
        where: { userId_badgeId: { userId, badgeId } },
      });
      
      if (alreadyEarned) continue;

      let shouldUnlock = false;

      switch (def.criteria.type) {
        case "TEST_COMPLETED": {
          const testCount = await (prisma as any).testAttempt.count({
            where: { userId },
          });
          shouldUnlock = testCount >= (def.criteria.count || 0);
          break;
        }
        case "PERFECT_SCORE": {
          // totalScore is raw marks, not a percentage -- comparing it to a
          // literal 100 is meaningless for both real tests (raw marks, e.g.
          // up to 300-400) and practice-arena attempts (always 0 or 1).
          // "Perfect" means full marks on a real test: totalScore equals
          // that test's own totalMarks.
          const realAttempts = await (prisma as any).testAttempt.findMany({
            where: { userId, testId: { not: null } },
            select: { totalScore: true, test: { select: { totalMarks: true } } },
          });
          shouldUnlock = realAttempts.some(
            (a: any) => a.test?.totalMarks > 0 && a.totalScore === a.test.totalMarks
          );
          break;
        }
        case "STREAK": {
          // The platform-level streak a student actually sees (StreakCalendar),
          // not the unrelated per-topic StudentProgress.currentStreak.
          const { currentStreak } = await computePlatformStreak(prisma as any, userId);
          shouldUnlock = currentStreak >= (def.criteria.count || 0);
          break;
        }
        case "PRACTICE_COUNT": {
          const practiceCount = await (prisma as any).testResponse.count({
            where: { attempt: { userId } },
          });
          shouldUnlock = practiceCount >= (def.criteria.count || 0);
          break;
        }
        case "DOUBT_COUNT": {
          const doubtCount = await (prisma as any).teacherQuery.count({
            where: { studentId: userId },
          });
          shouldUnlock = doubtCount >= (def.criteria.count || 0);
          break;
        }
        case "POINTS_TOTAL": {
          const totalPoints = await getUserTotalPoints(userId);
          shouldUnlock = totalPoints >= (def.criteria.count || 0);
          break;
        }
        case "TOP_SCORER": {
          // Eligibility, not visibility: includeOptedOut bypasses the
          // public-leaderboard opt-in filter so a student who reasonably
          // opted out of public ranking can still earn this achievement.
          // A teacher's excludedFromRankings moderation decision is never
          // bypassed, though (computeBatchLeaderboard always applies it).
          const enrollments = await (prisma as any).batchEnrollment.findMany({
            where: { studentId: userId, status: "APPROVED" },
            select: { batchId: true },
          });
          for (const { batchId } of enrollments) {
            const { leaderboard } = await computeBatchLeaderboard(prisma as any, batchId, { includeOptedOut: true });
            if (leaderboard[0]?.userId === userId) {
              shouldUnlock = true;
              break;
            }
          }
          break;
        }
      }

      if (shouldUnlock) {
        await (prisma as any).userBadge.create({
          data: { userId, badgeId },
          include: { badge: true },
        });

        // POINTS_RULES.PRACTICE_STREAK_7/30 were defined but never awarded
        // anywhere -- award them the first time each threshold is crossed,
        // using this same shouldUnlock/alreadyEarned gate as the natural
        // once-only dedup (a direct pointsTransaction.create, not
        // awardPoints(), to avoid recursively re-entering checkBadgeUnlocks
        // mid-iteration).
        if (def.criteria.type === "STREAK") {
          const bonus = def.criteria.count === 30 ? POINTS_RULES.PRACTICE_STREAK_30
            : def.criteria.count === 7 ? POINTS_RULES.PRACTICE_STREAK_7
            : null;
          if (bonus) {
            await (prisma as any).pointsTransaction.create({
              data: { userId, points: bonus, reason: `${def.criteria.count}-day streak bonus` },
            });
          }
        }

        // Create notification for badge unlock
        await (prisma as any).notification.create({
          data: {
            userId,
            title: "🏆 Badge Unlocked!",
            message: `You earned the "${def.name}" badge! ${def.description}`,
            type: "ACHIEVEMENT",
          },
        });
      }
    }
  } catch (error) {
    console.error("Error checking badge unlocks:", error);
  }
}

export async function seedBadges() {
  for (const def of BADGE_DEFINITIONS) {
    const badgeId = `badge_${def.name.toLowerCase().replace(/\s+/g, '_')}`;
    
    const existing = await (prisma as any).badge.findUnique({
      where: { id: badgeId },
    });

    if (!existing) {
      await (prisma as any).badge.create({
        data: {
          id: badgeId,
          ...def,
        },
      });
      console.log(`✅ Badge created: ${def.name}`);
    }
  }
  console.log("✅ All badges seeded!");
}
