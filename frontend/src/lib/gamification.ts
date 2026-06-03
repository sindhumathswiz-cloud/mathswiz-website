import prisma from "@/lib/prisma";

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
    icon: "Footprints",
    category: "achievement",
    points: 10,
    criteria: { type: "TEST_COMPLETED", count: 1 },
    isSecret: false,
  },
  {
    name: "Perfect Score",
    description: "Scored 100% on a test",
    icon: "Target",
    category: "achievement",
    points: 25,
    criteria: { type: "PERFECT_SCORE" },
    isSecret: false,
  },
  {
    name: "7-Day Streak",
    description: "Practiced for 7 consecutive days",
    icon: "Flame",
    category: "milestone",
    points: 50,
    criteria: { type: "STREAK", count: 7 },
    isSecret: false,
  },
  {
    name: "30-Day Warrior",
    description: "Practiced for 30 consecutive days",
    icon: "Sword",
    category: "milestone",
    points: 200,
    criteria: { type: "STREAK", count: 30 },
    isSecret: false,
  },
  {
    name: "Batch Topper",
    description: "Ranked #1 in your batch",
    icon: "Trophy",
    category: "achievement",
    points: 100,
    criteria: { type: "TOP_SCORER" },
    isSecret: false,
  },
  {
    name: "Bookworm",
    description: "Completed 50 practice questions",
    icon: "BookOpen",
    category: "milestone",
    points: 30,
    criteria: { type: "PRACTICE_COUNT", count: 50 },
    isSecret: false,
  },
  {
    name: "Doubt Crusher",
    description: "Asked 10 doubts",
    icon: "MessageCircle",
    category: "achievement",
    points: 15,
    criteria: { type: "DOUBT_COUNT", count: 10 },
    isSecret: false,
  },
  {
    name: "Century Club",
    description: "Earned 100+ points",
    icon: "Zap",
    category: "special",
    points: 0,
    criteria: { type: "POINTS_TOTAL", count: 100 },
    isSecret: true,
  },
  {
    name: "Point Master",
    description: "Earned 500+ points",
    icon: "Crown",
    category: "special",
    points: 0,
    criteria: { type: "POINTS_TOTAL", count: 500 },
    isSecret: true,
  },
  {
    name: "Legend",
    description: "Earned 1000+ points",
    icon: "Star",
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
          const perfectTests = await (prisma as any).testAttempt.count({
            where: { userId, totalScore: 100 },
          });
          shouldUnlock = perfectTests > 0;
          break;
        }
        case "STREAK": {
          const progress = await (prisma as any).studentProgress.findFirst({
            where: { userId },
            orderBy: { currentStreak: 'desc' },
          });
          shouldUnlock = (progress?.currentStreak || 0) >= (def.criteria.count || 0);
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
          // This needs batch context, will be checked separately
          shouldUnlock = false;
          break;
        }
      }

      if (shouldUnlock) {
        await (prisma as any).userBadge.create({
          data: { userId, badgeId },
          include: { badge: true },
        });

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
