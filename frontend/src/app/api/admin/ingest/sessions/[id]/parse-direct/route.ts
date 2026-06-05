import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { parseMathpixMarkdown } from "@/lib/mathpix-parser";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }
    const userId = (session.user as { id: string }).id;

    const { id: sessionId } = await params;

    // Get extraction session with all pages
    const extractionSession = await prisma.extractionSession.findUnique({
      where: { id: sessionId },
      include: {
        sourceDocument: {
          include: {
            pages: { orderBy: { pageNumber: "asc" } },
          },
        },
        solutionDocument: {
          include: {
            pages: { orderBy: { pageNumber: "asc" } },
          },
        },
      },
    });

    if (!extractionSession) {
      return NextResponse.json({ success: false, error: "Session not found" }, { status: 404 });
    }
    if (extractionSession.userId !== userId) {
      return NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 });
    }

    const questionPages = extractionSession.sourceDocument?.pages || [];
    const solutionPages = extractionSession.solutionDocument?.pages || [];

    console.log(`[PARSE-DIRECT] Session: ${sessionId}`);
    console.log(`[PARSE-DIRECT] sourceDocument: ${extractionSession.sourceDocument?.id || 'null'}`);
    console.log(`[PARSE-DIRECT] questionPages count: ${questionPages.length}`);
    console.log(`[PARSE-DIRECT] solutionPages count: ${solutionPages.length}`);
    if (questionPages.length > 0) {
      console.log(`[PARSE-DIRECT] First page rawMarkdown length: ${questionPages[0].rawMarkdown?.length || 0}`);
      console.log(`[PARSE-DIRECT] First page rawMarkdown sample: ${questionPages[0].rawMarkdown?.substring(0, 500) || 'empty'}`);
    }
    if (solutionPages.length > 0) {
      console.log(`[PARSE-DIRECT] First solution page rawMarkdown length: ${solutionPages[0].rawMarkdown?.length || 0}`);
      console.log(`[PARSE-DIRECT] First solution page rawMarkdown sample: ${solutionPages[0].rawMarkdown?.substring(0, 500) || 'empty'}`);
    }

    if (questionPages.length === 0) {
      return NextResponse.json(
        {
          success: true,
          questions: [],
          count: 0,
          message: "No pages found. The PDF may not have been scanned yet. Click the Scan button in the composer first.",
          debug: {
            pageCount: 0,
            totalChars: 0,
            sampleContent: '',
            hasSourceDocument: !!extractionSession.sourceDocument,
          },
        },
        { status: 200 }
      );
    }

    // DEBUG: Log solution page content for debugging
    if (solutionPages.length > 0) {
      console.log(`[PARSE-DIRECT] Solution pages: ${solutionPages.length}`);
      for (const sp of solutionPages) {
        console.log(`[PARSE-DIRECT] Solution page ${sp.pageNumber} sample:\n${sp.rawMarkdown.substring(0, 800)}`);
      }
    }

    // Parse using Mathpix Direct Parser (zero LLM cost)
    const parsedQuestions = parseMathpixMarkdown(questionPages, {
      solutionPages: solutionPages.length > 0 ? solutionPages : undefined,
    });

    // DEBUG: Log what we're parsing
    const sampleContent = questionPages[0]?.rawMarkdown?.substring(0, 2000) || '';
    console.log(`[PARSE-DIRECT] Pages: ${questionPages.length}, Total chars: ${questionPages.reduce((a, p) => a + p.rawMarkdown.length, 0)}`);
    console.log(`[PARSE-DIRECT] Sample content:\n${sampleContent}`);

    // Add topic/class/subject tags from session context
    const contextTags: string[] = [];
    if (extractionSession.className) contextTags.push(extractionSession.className.toUpperCase());
    if (extractionSession.subjectName) contextTags.push(extractionSession.subjectName.toUpperCase());
    if (extractionSession.topicName) contextTags.push(extractionSession.topicName.toUpperCase());

    if (parsedQuestions.length === 0) {
      return NextResponse.json(
        {
          success: true,
          questions: [],
          count: 0,
          message: "No questions detected. The PDF may not contain standard question formatting.",
        },
        { status: 200 }
      );
    }

    // Map parser types to composer types
    const typeMap: Record<string, string> = {
      SINGLE_CHOICE: "MCQ",
      MULTIPLE_CHOICE: "MCQ",
      FILL_IN_BLANKS: "FILL_IN_THE_BLANK",
      TRUE_FALSE: "VERY_SHORT_ANSWER",
      SHORT_ANSWER: "SHORT_ANSWER",
      LONG_ANSWER: "LONG_ANSWER",
      ASSERTION_REASONING: "ASSERTION_REASONING",
      CASE_STUDY: "CASE_STUDY",
      INTEGER: "SHORT_ANSWER",
      SUBJECTIVE: "LONG_ANSWER",
    };

    // Combine parsed questions with duplicate check results
    const questions = parsedQuestions.map((q, idx) => ({
      id: `parsed-q-${Date.now()}-${idx}`,
      number: q.number,
      type: typeMap[q.type] || q.type,
      question: q.question,
      options: q.options || undefined,
      correctOption: q.correctOption,
      assertion: q.assertion || undefined,
      reasoning: q.reasoning || undefined,
      passage: q.passage || undefined,
      subQuestions: q.subQuestions || undefined,
      solution: q.solution || undefined,
      tags: [...new Set([...q.tags, ...contextTags])],
      difficulty: q.difficulty,
      sourcePage: q.sourcePage,
      rawText: q.rawText,
      duplicate: {
        isDuplicate: false,
        matchType: "none",
        similarity: 0,
        matchedQuestionId: null,
        matchedQuestionText: null,
      },
    }));

    console.log(`[PARSE-DIRECT] Parsed ${questions.length} questions`);
    console.log(`[PARSE-DIRECT] Questions with solutions: ${questions.filter(q => q.solution).length}`);
    console.log(`[PARSE-DIRECT] Questions with correctOption: ${questions.filter(q => q.correctOption).length}`);
    console.log(`[PARSE-DIRECT] Context tags: ${contextTags.join(', ')}`);

    // Log first 5 questions with their solutions and correctOption
    questions.slice(0, 5).forEach(q => {
      console.log(`[PARSE-DIRECT] Q${q.number}: solution="${q.solution?.substring(0, 100) || 'none'}", correctOption=${q.correctOption || 'none'}, options=${q.options?.map(o => o.label).join(',') || 'none'}`);
    });

    return NextResponse.json({
      success: true,
      questions,
      count: questions.length,
      stats: {
        total: questions.length,
        withSolutions: questions.filter((q) => q.solution).length,
        withOptions: questions.filter((q) => q.options).length,
        duplicates: 0,
        byType: questions.reduce((acc, q) => {
          acc[q.type] = (acc[q.type] || 0) + 1;
          return acc;
        }, {} as Record<string, number>),
        byDifficulty: questions.reduce((acc, q) => {
          acc[q.difficulty] = (acc[q.difficulty] || 0) + 1;
          return acc;
        }, {} as Record<string, number>),
      },
      debug: {
        pageCount: questionPages.length,
        totalChars: questionPages.reduce((a, p) => a + p.rawMarkdown.length, 0),
        sampleContent: questionPages[0]?.rawMarkdown?.substring(0, 1000) || '',
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to parse questions";
    console.error("[PARSE-DIRECT] Error:", message);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
