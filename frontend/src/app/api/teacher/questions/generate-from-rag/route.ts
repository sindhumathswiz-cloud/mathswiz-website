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
    const { topic, topicId, folderId, count = 5, types = ['MCQ'], difficulties = ['MEDIUM'], taxonomyIds } = body;

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
        where: { id: folderId, ...(userRole === "ADMIN" ? {} : { userId }) },
        select: { topicName: true, className: true, subject: true }
      });
      if (!folder) return NextResponse.json({ success: false, error: "Folder not found or not owned by you" }, { status: 403 });
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

Use the provided textbook excerpts AND similar existing questions (if any) to create exam-quality questions.
Questions must be DIRECTLY based on concepts from the provided excerpts.
You may use the similar existing questions as a reference for style, difficulty, and format — but generate NEW questions, do not duplicate them.
Use the same notation and terminology as the source material.

Rules:
- Generate exactly ${count} questions
- Types allowed: ${types.join(', ')}
- Difficulty: ${difficulties.join(', ')}
- Every question MUST have a complete solution/explanation
- Format all LaTeX properly with $...$ for inline and $$...$$ for display math
- For MCQs: provide exactly 4 options (A, B, C, D) with one correct answer
- Questions should be original (not copied verbatim from the text)
- Tag each question with relevant topic keywords
- Return ONLY valid JSON, no markdown wrapping

Return format:
{
  "questions": [
    {
      "type": "MCQ" | "VERY_SHORT_ANSWER" | "SHORT_ANSWER" | "LONG_ANSWER" | "FILL_IN_THE_BLANK",
      "content": "full question text",
      "options": ["option A", "option B", "option C", "option D"] | null,
      "correctAnswer": "A" | null,
      "explanation": "detailed solution",
      "difficulty": "EASY" | "MEDIUM" | "HARD",
      "tags": ["topic1", "topic2"]
    }
  ]
}`;

    const userPrompt = `Topic: ${searchQuery}

SOURCE MATERIAL (textbook excerpts):
${contextText}${examplesText}

Generate ${count} questions of type(s) ${types.join(', ')} at ${difficulties.join(', ')} difficulty based on the above material.`;

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

    for (const q of questions) {
      let questionType = 'SINGLE_CHOICE';
      if (q.type === 'VERY_SHORT_ANSWER') questionType = 'VERY_SHORT_ANSWER';
      else if (q.type === 'SHORT_ANSWER') questionType = 'SHORT_ANSWER';
      else if (q.type === 'LONG_ANSWER') questionType = 'LONG_ANSWER';
      else if (q.type === 'FILL_IN_THE_BLANK') questionType = 'FILL_IN_BLANKS';

      await prisma.question.create({
        data: {
          content: q.content || '',
          options: q.options || [],
          correctAnswer: q.correctAnswer || q.correctOption || '',
          explanation: q.explanation || q.solution || '',
          type: questionType as any,
          difficulty: (q.difficulty || 'MEDIUM') as any,
          status: 'PENDING_REVIEW',
          scope: scope as any,
          createdById: userId,
          tags: ['AI-GENERATED', ...(q.tags || [])],
        }
      });
      savedCount++;
    }

    return NextResponse.json({
      success: true,
      generated: savedCount,
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
