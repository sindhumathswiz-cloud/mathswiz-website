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

    // Background backfill for existing questions with taxonomy tags but empty topic/subTopic/class fields
    // This runs immediately in the background and does not block the stats response
    (async () => {
      try {
        const qs = await prisma.question.findMany({
          where: {
            OR: [
              { class: null }, { topic: null }, { subTopic: null },
              { class: "" }, { topic: "" }, { subTopic: "" },
            ]
          },
          include: { questionTags: { include: { tag: { select: { name: true, type: true } } } } }
        });
        const updates: { id: string; data: any }[] = [];
        for (const q of qs) {
          const classTax = q.questionTags.find(qt => qt.tag.type === 'CLASS');
          const subjectTax = q.questionTags.find(qt => qt.tag.type === 'SUBJECT');
          const topicTax = q.questionTags.find(qt => qt.tag.type === 'TOPIC');
          const subTopicTax = q.questionTags.find(qt => qt.tag.type === 'SUBTOPIC');
          const data: any = {};
          if ((!q.class || q.class === "") && classTax) data.class = classTax.tag.name;
          if ((!q.subject || q.subject === "") && subjectTax) data.subject = subjectTax.tag.name;
          if ((!q.topic || q.topic === "") && topicTax) data.topic = topicTax.tag.name;
          if ((!q.subTopic || q.subTopic === "") && subTopicTax) data.subTopic = subTopicTax.tag.name;
          if (Object.keys(data).length > 0) updates.push({ id: q.id, data });
        }
        // Batch in groups of 10 to avoid overloading the transaction
        for (let i = 0; i < updates.length; i += 10) {
          const batch = updates.slice(i, i + 10);
          await prisma.$transaction(batch.map(u => prisma.question.update({ where: { id: u.id }, data: u.data })));
        }
      } catch (e) {
        console.error('[STATS-BACKFILL] Background sync error:', e);
      }
    })();

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
