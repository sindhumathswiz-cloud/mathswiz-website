import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { searchSimilar, searchSimilarQuestions } from "@/lib/vector-store";
import { generateEmbedding } from "@/lib/embeddings";
import prisma from "@/lib/prisma";
import { fetchFromLLM } from "@/lib/llm";

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }
    const userId = (session.user as { id: string }).id;
    const userRole = (session.user as any).role;

    const body = await request.json();
    const { topic, topicId, folderId, count = 5, difficulties = ['MEDIUM'], taxonomyIds } = body;
    // Knowledge-base generation only ever produces options-based questions —
    // SCQ (one correct answer) or MCQ (multiple correct answers allowed).
    const allowedTypes = ['SCQ', 'MCQ'];
    const requestedTypes = (Array.isArray(body.types) ? body.types : ['SCQ'])
      .map((t: string) => (t === 'SINGLE_CHOICE' ? 'SCQ' : t === 'MULTIPLE_CHOICE' ? 'MCQ' : t))
      .filter((t: string) => allowedTypes.includes(t));
    const types = requestedTypes.length > 0 ? requestedTypes : ['SCQ'];

    if (!topic && !topicId && !folderId && !taxonomyIds) {
      return NextResponse.json({ success: false, error: "topic, topicId, folderId, or taxonomyIds required" }, { status: 400 });
    }

    // Determine the search query, folder IDs, and taxonomy tag filters
    let searchQuery = topic || '';
    let folderIds: string[] | undefined;
    let tagFilters: string[] | undefined;

    if (folderId) {
      folderIds = [folderId];
      const folder = await prisma.knowledgeFolder.findFirst({
        where: {
          id: folderId,
          ...(userRole === "ADMIN" ? {} : { OR: [{ userId }, { user: { role: 'ADMIN' } }] })
        },
        select: { topicName: true, className: true, subject: true }
      });
      if (!folder) return NextResponse.json({ success: false, error: "Folder not found or not accessible to you" }, { status: 403 });
      if (folder && !searchQuery) searchQuery = folder.topicName || folder.subject || folder.className || '';
    }

    // Resolve explicit taxonomy IDs
    const allTaxonomyIds = [...(taxonomyIds || [])];
    if (topicId && !allTaxonomyIds.includes(topicId)) {
      allTaxonomyIds.push(topicId);
    }

    if (allTaxonomyIds.length > 0) {
      const taxonomies = await prisma.tagTaxonomy.findMany({
        where: { id: { in: allTaxonomyIds } },
        select: { name: true, type: true, parentId: true }
      });

      // Use taxonomy names as tag filters (uppercase to match stored format)
      tagFilters = taxonomies.map(t => t.name.toUpperCase());

      // Set search query from taxonomy name if not provided
      if (!searchQuery) {
        searchQuery = taxonomies.map(t => t.name).join(' ');
      }

      // If no folderIds provided, find folders matching these taxonomy terms
      if (!folderIds) {
        const taxonomyTerms = taxonomies.map(t => t.name);
        const matchingFolders = await prisma.knowledgeFolder.findMany({
          where: {
            OR: taxonomyTerms.flatMap(term => [
              { topicName: { contains: term, mode: 'insensitive' } },
              { className: { contains: term, mode: 'insensitive' } },
              { subject: { contains: term, mode: 'insensitive' } },
            ])
          },
          select: { id: true }
        });
        if (matchingFolders.length > 0) {
          folderIds = matchingFolders.map(f => f.id);
        }
      }
    } else if (topicId && !taxonomyIds) {
      // Legacy single topicId path
      const topicNode = await prisma.tagTaxonomy.findUnique({
        where: { id: topicId },
        select: { name: true }
      });
      if (topicNode && !searchQuery) searchQuery = topicNode.name;
      tagFilters = topicNode ? [topicNode.name.toUpperCase()] : undefined;
      const matchingFolders = await prisma.knowledgeFolder.findMany({
        where: {
          OR: [
            { topicName: { contains: searchQuery || topicNode?.name || '', mode: 'insensitive' } },
            { className: { contains: searchQuery || '', mode: 'insensitive' } },
            { subject: { contains: searchQuery || '', mode: 'insensitive' } },
          ]
        },
        select: { id: true }
      });
      if (matchingFolders.length > 0) {
        folderIds = matchingFolders.map(f => f.id);
      }
    }

    // Retrieve relevant chunks AND similar questions via RAG
    const embedding = await generateEmbedding(searchQuery);
    const [chunks, similarQuestions] = await Promise.all([
      searchSimilar(embedding, 15, folderIds, tagFilters),
      searchSimilarQuestions(embedding, 5, tagFilters),
    ]);

    if (chunks.length === 0 && similarQuestions.length === 0) {
      return NextResponse.json({ success: false, error: "No relevant content found in RAG store. Process documents for RAG first." }, { status: 400 });
    }

    const contextText = chunks.map(c => c.content).join('\n\n---\n\n');
    const examplesText = similarQuestions.length > 0
      ? '\n\nSIMILAR EXISTING QUESTIONS (use as style/format reference):\n' + similarQuestions.map((q, i) =>
          `Example ${i + 1}:\n${q.content}\nTags: ${q.tags.join(', ')}`
        ).join('\n\n---\n\n')
      : '';

    const systemPrompt = `You are a mathematics question generator for CBSE/JEE/CUET/NDA exams.

EXTRACTION vs GENERATION RULE (apply this per question, in order):
1. First, check whether the SOURCE MATERIAL already contains a real question matching the requested topic/difficulty. If it does, use that question's stem VERBATIM (do not reword or invent a different problem) and set "sourced": true. If the source question doesn't already present 4 answer options, write plausible distractor options yourself, but keep the correct option faithful to the source material — never guess at or fabricate an answer that isn't supported by the source text.
2. Only when the source material does not contain enough real questions to reach ${count}, generate a brand-new original question in the same style/notation as the source and set "sourced": false. You may use the similar existing questions below as a style/format reference, but never duplicate them.

Rules:
- Generate exactly ${count} questions
- Types allowed: ${types.join(', ')} (SCQ = single correct answer, MCQ = one or more correct answers)
- Difficulty: ${difficulties.join(', ')}
- Every question MUST have exactly 4 options (A, B, C, D) — never generate a free-text or fill-in-the-blank question
- SCQ: correctAnswer is exactly one letter, e.g. "B"
- MCQ: correctAnswer is a comma-separated list of every correct letter, e.g. "A,C"
- Every question MUST have a complete solution/explanation
- Format all LaTeX properly with $...$ for inline and $$...$$ for display math
- Tag each question with relevant topic keywords
- Return ONLY valid JSON, no markdown wrapping

Return format:
{
  "questions": [
    {
      "type": "SCQ" | "MCQ",
      "content": "full question text",
      "options": ["option A", "option B", "option C", "option D"],
      "correctAnswer": "B",
      "explanation": "detailed solution",
      "difficulty": "EASY" | "MEDIUM" | "HARD",
      "tags": ["topic1", "topic2"],
      "sourced": true
    }
  ]
}`;

    const userPrompt = `Topic: ${searchQuery}

SOURCE MATERIAL (textbook excerpts):
${contextText}${examplesText}

Generate ${count} questions of type(s) ${types.join(', ')} at ${difficulties.join(', ')} difficulty. Prefer extracting real questions from the source material above generating new ones — follow the EXTRACTION vs GENERATION RULE.`;

    const llmResponse = await fetchFromLLM(systemPrompt, userPrompt);

    let parsed;
    try {
      parsed = JSON.parse(llmResponse);
    } catch {
      const jsonMatch = llmResponse.match(/\{[\s\S]*\}/);
      if (jsonMatch) parsed = JSON.parse(jsonMatch[0]);
      else throw new Error("LLM response was not valid JSON");
    }

    const questions = parsed.questions || parsed;
    if (!Array.isArray(questions)) {
      throw new Error("LLM response did not contain a questions array");
    }

    // Save questions to the Question bank
    const scope = userRole === 'ADMIN' ? 'PUBLIC' : 'TEACHER_PRIVATE';
    let savedCount = 0;
    let extractedCount = 0;

    for (const q of questions) {
      // Skip anything the LLM produced without real options — this pipeline
      // only ever saves options-based (SCQ/MCQ) questions.
      if (!Array.isArray(q.options) || q.options.length < 2 || !q.correctAnswer) continue;

      const questionType = q.type === 'MCQ' ? 'MULTIPLE_CHOICE' : 'SINGLE_CHOICE';

      await prisma.question.create({
        data: {
          content: q.content || '',
          options: q.options,
          correctAnswer: q.correctAnswer || q.correctOption || '',
          explanation: q.explanation || q.solution || '',
          type: questionType as any,
          difficulty: (q.difficulty || 'MEDIUM') as any,
          status: 'PENDING_REVIEW',
          scope: scope as any,
          createdById: userId,
          tags: [q.sourced ? 'EXTRACTED-FROM-SOURCE' : 'AI-GENERATED', ...(q.tags || [])],
        }
      });
      savedCount++;
      if (q.sourced) extractedCount++;
    }

    return NextResponse.json({
      success: true,
      generated: savedCount,
      extracted: extractedCount,
      questions,
      status: 'PENDING_REVIEW',
      scope,
      contextSources: chunks.length,
      similarQuestionSources: similarQuestions.length,
      taxonomyFilters: tagFilters,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to generate questions";
    console.error("[GENERATE-FROM-RAG] Error:", message);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
