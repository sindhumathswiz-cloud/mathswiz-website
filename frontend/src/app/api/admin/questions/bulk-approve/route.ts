import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }
    const userId = (session.user as { id: string }).id;
    const role = (session.user as { role: string }).role;

    const body = await request.json();
    const { questions, className, subjectName, topicName, topicId, topicIds } = body;

    console.log(`[BULK-APPROVE] Received ${questions?.length || 0} questions`);
    console.log(`[BULK-APPROVE] Context: class=${className}, subject=${subjectName}, topic=${topicName}`);
    console.log(`[BULK-APPROVE] Topic IDs: ${topicIds ? JSON.stringify(topicIds) : topicId || 'none'}`);
    console.log(`[BULK-APPROVE] First question: ${JSON.stringify(questions?.[0])?.substring(0, 200)}`);

    if (!Array.isArray(questions) || questions.length === 0) {
      return NextResponse.json({ success: false, error: "No questions provided" }, { status: 400 });
    }

    const typeMap: Record<string, string> = {
      MCQ: "SINGLE_CHOICE",
      ASSERTION_REASONING: "SINGLE_CHOICE",
      CASE_STUDY: "SUBJECTIVE",
      FILL_IN_THE_BLANK: "SUBJECTIVE",
      VERY_SHORT_ANSWER: "SUBJECTIVE",
      SHORT_ANSWER: "SUBJECTIVE",
      LONG_ANSWER: "SUBJECTIVE",
      SINGLE_CHOICE: "SINGLE_CHOICE",
      MULTIPLE_CHOICE: "MULTIPLE_CHOICE",
      INTEGER: "INTEGER",
      TRUE_FALSE: "TRUE_FALSE",
      SUBJECTIVE: "SUBJECTIVE",
    };

    const difficultyMap: Record<string, string> = {
      EASY: "EASY",
      MEDIUM: "MEDIUM",
      HARD: "HARD",
    };

    const allTopicIds = topicIds || (topicId ? [topicId] : []);

    const created = await prisma.$transaction(async (tx) => {
      const results: any[] = [];
      for (const q of questions) {
        const mappedType = typeMap[q.type] || "SINGLE_CHOICE";
        const mappedDifficulty = difficultyMap[q.difficulty] || "MEDIUM";

        const question = await tx.question.create({
          data: {
            content: q.question || "",
            options: q.options ? q.options.map((o: any) => o.text) : [],
            correctAnswer: q.correctOption || "",
            explanation: q.solution || "",
            tags: q.tags || [],
            type: mappedType as any,
            difficulty: mappedDifficulty as any,
            subject: subjectName || "Mathematics",
            class: className || "Class 12",
            topic: topicName || null,
            scope: role === "ADMIN" ? "PUBLIC" : "TEACHER_PRIVATE",
            status: q.status === "PENDING_REVIEW" ? "PENDING_REVIEW" : "APPROVED",
            createdById: userId,
            sourceDocumentId: q.sourceDocumentId || null,
            confidence: 100,
          },
        });

        for (const tid of allTopicIds) {
          await tx.questionTag.create({
            data: { questionId: question.id, tagId: tid },
          });
        }

        results.push(question);
      }
      return results;
    });

    console.log(`[BULK-APPROVE] Successfully created ${created.length} questions`);
    console.log(`[BULK-APPROVE] IDs: ${created.map(q => q.id).join(', ')}`);
    console.log(`[BULK-APPROVE] Tagged with ${allTopicIds.length} topic(s)`);

    return NextResponse.json({
      success: true,
      count: created.length,
      ids: created.map((q) => q.id),
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to approve questions";
    console.error("[BULK-APPROVE] Error:", message);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
