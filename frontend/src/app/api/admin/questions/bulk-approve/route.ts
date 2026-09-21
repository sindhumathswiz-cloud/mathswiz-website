import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { deriveProvenance, provenanceApprovalError } from "@/lib/question-provenance";
import { structuralApprovalError } from "@/lib/question-qa";
import { figureApprovalError } from "@/lib/question-figures";

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
    const downgraded: Array<{ index: number; reason: string }> = [];

    const created = await prisma.$transaction(async (tx) => {
      const results: any[] = [];
      for (const [index, q] of questions.entries()) {
        const mappedType = typeMap[q.type] || "SINGLE_CHOICE";
        const mappedDifficulty = difficultyMap[q.difficulty] || "MEDIUM";
        const content = q.question || "";
        const options = q.options ? q.options.map((o: any) => o.text) : [];
        const correctAnswer = q.correctOption || "";
        const explanation = q.solution || "";

        const bookId = q.bookId || null;
        const sourcePageStart = Number.isInteger(q.sourcePageStart) ? q.sourcePageStart : null;
        const sourcePageEnd = Number.isInteger(q.sourcePageEnd) ? q.sourcePageEnd : null;
        const printedNumber = q.printedNumber || null;
        // An explicit q.provenance always wins (lets a caller flag a
        // manually-curated question as MANUALLY_AUTHORED even if it happens
        // to carry a bookId, e.g. "based on chapter 4" without a real page
        // reference); otherwise derive it from whether a book is linked.
        const provenance = q.provenance === 'MANUALLY_AUTHORED' || q.provenance === 'BOOK_SOURCED'
          ? q.provenance
          : deriveProvenance(bookId);

        let status: string = q.status === "PENDING_REVIEW" ? "PENDING_REVIEW" : "APPROVED";
        if (status === 'APPROVED') {
          // The Question Bank acceptance gate: no source-derived question may
          // be approved without its source page and printed identifier, and
          // no question with an error-severity structural QA issue
          // (duplicate/missing options, an answer that doesn't resolve to an
          // option) may be approved either -- see lib/question-provenance.ts
          // and lib/question-qa.ts. Hold just this one back for review rather
          // than failing the whole batch or silently approving it.
          // The figure half of the same gate (lib/question-figures.ts). This
          // row doesn't exist yet, so no PageFigure could possibly already be
          // linked to it -- the placeholder id below only matters for that
          // lookup, which correctly comes back empty either way -- but a
          // figure-referencing question with a real page range can still be
          // caught missing its asset, or blocked by a stray unresolved
          // figure sitting on that same page.
          const figureReason = (bookId && sourcePageStart != null && sourcePageEnd != null)
            ? await figureApprovalError({ id: `pending-${index}`, bookId, sourcePageStart, sourcePageEnd, content, explanation })
            : null;
          const reasons = [
            provenanceApprovalError({ provenance, bookId, sourcePageStart, sourcePageEnd, printedNumber }),
            structuralApprovalError({ content, options, correctAnswer, explanation, type: mappedType }),
            figureReason,
          ].filter((r): r is string => r != null);
          if (reasons.length > 0) {
            status = 'PENDING_REVIEW';
            downgraded.push({ index, reason: reasons.join(' | ') });
          }
        }

        const question = await tx.question.create({
          data: {
            content,
            options,
            correctAnswer,
            explanation,
            tags: q.tags || [],
            type: mappedType as any,
            difficulty: mappedDifficulty as any,
            subject: subjectName || "Mathematics",
            class: className || "Class 12",
            topic: topicName || null,
            scope: role === "ADMIN" ? "PUBLIC" : "TEACHER_PRIVATE",
            status: status as any,
            provenance,
            bookId,
            sourcePageStart,
            sourcePageEnd,
            printedNumber,
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
      downgraded,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to approve questions";
    console.error("[BULK-APPROVE] Error:", message);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
