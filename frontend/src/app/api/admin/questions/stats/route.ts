import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }

    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    // Total counts by status
    const [total, approved, pending, reported, draft, recentCount] = await Promise.all([
      prisma.question.count(),
      prisma.question.count({ where: { status: "APPROVED" } }),
      prisma.question.count({ where: { status: "PENDING_REVIEW" } }),
      prisma.question.count({ where: { status: "REPORTED" } }),
      prisma.question.count({ where: { status: "DRAFT" } }),
      prisma.question.count({ where: { createdAt: { gte: sevenDaysAgo } } }),
    ]);

    // By class
    const byClassRaw = await prisma.question.groupBy({
      by: ["class"],
      _count: true,
      where: { class: { not: null } },
    });
    const byClass: Record<string, number> = {};
    for (const row of byClassRaw) {
      if (row.class) byClass[row.class] = row._count;
    }

    // By topic
    const byTopicRaw = await prisma.question.groupBy({
      by: ["topic"],
      _count: true,
      where: { topic: { not: null } },
    });
    const byTopic: Record<string, number> = {};
    for (const row of byTopicRaw) {
      if (row.topic) byTopic[row.topic] = row._count;
    }

    // By type
    const byTypeRaw = await prisma.question.groupBy({
      by: ["type"],
      _count: true,
    });
    const byType: Record<string, number> = {};
    for (const row of byTypeRaw) {
      byType[row.type] = row._count;
    }

    // By difficulty
    const byDifficultyRaw = await prisma.question.groupBy({
      by: ["difficulty"],
      _count: true,
    });
    const byDifficulty: Record<string, number> = {};
    for (const row of byDifficultyRaw) {
      byDifficulty[row.difficulty] = row._count;
    }

    // By exam type
    const byExamTypeRaw = await prisma.question.groupBy({
      by: ["examType"],
      _count: true,
      where: { examType: { not: null } },
    });
    const byExamType: Record<string, number> = {};
    for (const row of byExamTypeRaw) {
      if (row.examType) byExamType[row.examType] = row._count;
    }

    // By sub-topic
    const bySubTopicRaw = await prisma.question.groupBy({
      by: ["subTopic"],
      _count: true,
      where: { subTopic: { not: null } },
    });
    const bySubTopic: Record<string, number> = {};
    for (const row of bySubTopicRaw) {
      if (row.subTopic) bySubTopic[row.subTopic] = row._count;
    }

    return NextResponse.json({
      success: true,
      stats: {
        total,
        approved,
        pending,
        reported,
        draft,
        recentCount,
        byClass,
        byTopic,
        bySubTopic,
        byType,
        byDifficulty,
        byExamType,
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to fetch stats";
    console.error("[QUESTION-STATS] Error:", message);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
