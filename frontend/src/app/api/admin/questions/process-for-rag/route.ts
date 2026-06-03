import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { generateEmbedding } from "@/lib/embeddings";

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }

    const { questionIds } = await request.json();

    // Get approved questions to process
    const questions = await prisma.question.findMany({
      where: {
        status: "APPROVED",
        ...(questionIds?.length > 0 ? { id: { in: questionIds } } : {}),
      },
      select: {
        id: true,
        content: true,
        explanation: true,
        options: true,
        type: true,
        topic: true,
        subTopic: true,
        class: true,
        tags: true,
      },
    });

    if (questions.length === 0) {
      return NextResponse.json({ success: true, processed: 0, message: "No approved questions to process" });
    }

    let processed = 0;
    let failed = 0;

    for (const q of questions) {
      try {
        // Build rich content for embedding
        const contentParts = [q.content];
        if (q.explanation) contentParts.push(`Solution: ${q.explanation}`);
        if (q.options) {
          const opts = JSON.parse(q.options as string);
          if (Array.isArray(opts)) {
            contentParts.push(`Options: ${opts.join(", ")}`);
          }
        }
        if (q.topic) contentParts.push(`Topic: ${q.topic}`);
        if (q.subTopic) contentParts.push(`Sub-topic: ${q.subTopic}`);
        if (q.class) contentParts.push(`Class: ${q.class}`);

        const fullContent = contentParts.join("\n");

        // Generate embedding
        const embedding = await generateEmbedding(fullContent);
        if (!embedding) {
          failed++;
          continue;
        }

        // Delete existing embedding if any
        await prisma.$executeRawUnsafe(
          `DELETE FROM "QuestionEmbedding" WHERE "questionId" = $1`,
          q.id
        );

        // Insert new embedding
        const embeddingStr = `[${embedding.join(",")}]`;
        await prisma.$executeRawUnsafe(
          `INSERT INTO "QuestionEmbedding" (id, "questionId", content, embedding, tags, "createdAt")
           VALUES ($1, $2, $3, $4::vector, $5, NOW())`,
          `qe-${q.id}`,
          q.id,
          fullContent,
          embeddingStr,
          q.tags || [],
        );

        processed++;
      } catch (e) {
        console.error(`[RAG] Failed to embed question ${q.id}:`, e);
        failed++;
      }
    }

    return NextResponse.json({
      success: true,
      processed,
      failed,
      total: questions.length,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to process questions for RAG";
    console.error("[QUESTION-RAG] Error:", message);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

// Get count of embedded questions
export async function GET() {
  try {
    const count = await prisma.$queryRawUnsafe<{ count: bigint }[]>(
      `SELECT COUNT(*) as count FROM "QuestionEmbedding"`
    );
    return NextResponse.json({
      success: true,
      count: Number(count[0]?.count || 0),
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to get count";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
