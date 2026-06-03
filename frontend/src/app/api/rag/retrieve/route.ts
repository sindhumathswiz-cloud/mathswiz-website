import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { searchSimilar, searchSimilarQuestions } from "@/lib/vector-store";
import { generateEmbedding } from "@/lib/embeddings";
import prisma from "@/lib/prisma";

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { query, topicName, folderIds, taxonomyIds, k = 10, includeQuestions = false } = body;

    if (!query && !topicName && !taxonomyIds) {
      return NextResponse.json({ success: false, error: "query, topicName, or taxonomyIds required" }, { status: 400 });
    }

    // Resolve taxonomy IDs to tag names for filtering
    let tagFilters: string[] | undefined;
    if (taxonomyIds && taxonomyIds.length > 0) {
      const taxonomies = await prisma.tagTaxonomy.findMany({
        where: { id: { in: taxonomyIds } },
        select: { name: true }
      });
      tagFilters = taxonomies.map(t => t.name.toUpperCase());
    }

    const searchQuery = query || topicName || (tagFilters?.join(' ') || '');
    const embedding = await generateEmbedding(searchQuery);

    const [chunks, questionResults] = await Promise.all([
      searchSimilar(embedding, k, folderIds, tagFilters),
      includeQuestions
        ? searchSimilarQuestions(embedding, k, tagFilters)
        : Promise.resolve([]),
    ]);

    const results = chunks.map((chunk, idx) => ({
      index: idx,
      source: 'document_chunk' as const,
      content: chunk.content,
      tags: chunk.tags,
    }));

    const questions = questionResults.map((q, idx) => ({
      index: idx,
      source: 'question_embedding' as const,
      content: q.content,
      tags: q.tags,
      questionId: q.questionId,
    }));

    return NextResponse.json({
      success: true,
      results,
      questions,
      count: results.length,
      questionCount: questions.length,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to retrieve chunks";
    console.error("[RAG-RETRIEVE] Error:", message);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
