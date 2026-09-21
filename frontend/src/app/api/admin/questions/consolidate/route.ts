import { NextResponse } from 'next/server';
import type { Prisma } from '@prisma/client';
import prisma from '@/lib/prisma';
import { getAuthenticatedUser } from '@/lib/auth-server';
import { recordAuditLog, requestAuditContext } from '@/lib/audit-log';
import { computeContentHash } from '@/lib/question-classifier';
import { provenanceApprovalError } from '@/lib/question-provenance';
import { structuralApprovalError } from '@/lib/question-qa';

export const dynamic = 'force-dynamic';

/**
 * One-time-use (but generally reusable) admin maintenance endpoint: folds a
 * cluster of already-saved question rows — typically the separate sub-parts
 * of a case study that got extracted as standalone questions instead of one
 * combined CASE_STUDY row — into a single new consolidated question, and
 * retires the originals.
 *
 * "Retires" means status -> ARCHIVED with an explanatory reviewNotes pointer
 * to the replacement, never a hard delete: permanently destroying data is
 * off-limits regardless of how confident the cleanup is, and ARCHIVED rows
 * simply drop out of the live/APPROVED question bank while remaining
 * inspectable/reversible in the DB.
 *
 * Safety: every id in retireIds must already belong to `bookId` (refuses to
 * touch anything from another book, which would indicate a client bug), and
 * the whole thing runs in one transaction so a partial failure can't leave a
 * new consolidated row without its originals retired (or vice versa).
 */
export async function POST(request: Request) {
  const auth = await getAuthenticatedUser(['ADMIN']);
  if ('error' in auth) return auth.error;

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const {
    bookId,
    bookChapterId,
    sourcePageStart,
    sourcePageEnd,
    printedNumber,
    subject,
    class: classLevel,
    topic,
    difficulty,
    tags,
    type,
    status,
    content,
    explanation,
    correctAnswer,
    options,
    reviewNotes,
    retireIds,
    retireNote,
  } = body as Record<string, unknown>;

  if (typeof bookId !== 'string' || !bookId) {
    return NextResponse.json({ error: 'bookId is required' }, { status: 400 });
  }
  if (typeof content !== 'string' || !content.trim()) {
    return NextResponse.json({ error: 'content is required' }, { status: 400 });
  }
  if (!Array.isArray(retireIds) || retireIds.length < 2 || !retireIds.every((v) => typeof v === 'string')) {
    return NextResponse.json({ error: 'retireIds must be an array of at least 2 question ids (a consolidation folds multiple rows into one)' }, { status: 400 });
  }
  if (typeof retireNote !== 'string' || !retireNote.trim()) {
    return NextResponse.json({ error: 'retireNote is required (explains the retirement on each folded-in row)' }, { status: 400 });
  }

  const existing = await prisma.question.findMany({
    where: { id: { in: retireIds as string[] } },
    select: { id: true, bookId: true, status: true },
  });
  if (existing.length !== retireIds.length) {
    const found = new Set(existing.map((q) => q.id));
    const missing = (retireIds as string[]).filter((id) => !found.has(id));
    return NextResponse.json({ error: `Some retireIds were not found: ${missing.join(', ')}` }, { status: 404 });
  }
  const wrongBook = existing.filter((q) => q.bookId !== bookId);
  if (wrongBook.length > 0) {
    return NextResponse.json({ error: `Some retireIds don't belong to bookId ${bookId}: ${wrongBook.map((q) => q.id).join(', ')}` }, { status: 400 });
  }

  const contentStr = content.trim();
  const resolvedSourcePageStart = typeof sourcePageStart === 'number' ? sourcePageStart : null;
  const resolvedSourcePageEnd = typeof sourcePageEnd === 'number' ? sourcePageEnd : null;
  const resolvedPrintedNumber = typeof printedNumber === 'string' && printedNumber ? printedNumber : null;
  const resolvedOptions = Array.isArray(options) ? options as string[] : [];
  const resolvedCorrectAnswer = typeof correctAnswer === 'string' && correctAnswer ? correctAnswer : null;
  const resolvedExplanation = typeof explanation === 'string' && explanation ? explanation : null;
  const resolvedType = typeof type === 'string' ? type : 'CASE_STUDY';

  // A consolidated question is always BOOK_SOURCED (bookId is required above)
  // and subject to the same acceptance gate as any other book-derived row --
  // see lib/question-provenance.ts and lib/question-qa.ts. Folding several
  // sub-questions into one doesn't exempt it from needing a source page and
  // printed identifier, or from passing structural QA on its own merged
  // content.
  let resolvedStatus = typeof status === 'string' ? status : 'APPROVED';
  let downgradeReason: string | null = null;
  if (resolvedStatus === 'APPROVED') {
    downgradeReason = [
      provenanceApprovalError({
        provenance: 'BOOK_SOURCED',
        bookId,
        sourcePageStart: resolvedSourcePageStart,
        sourcePageEnd: resolvedSourcePageEnd,
        printedNumber: resolvedPrintedNumber,
      }),
      structuralApprovalError({ content: contentStr, options: resolvedOptions, correctAnswer: resolvedCorrectAnswer ?? undefined, explanation: resolvedExplanation ?? undefined, type: resolvedType }),
    ].filter((r): r is string => r != null).join(' | ') || null;
    if (downgradeReason) resolvedStatus = 'PENDING_REVIEW';
  }

  try {
    const [created, ...retired] = await prisma.$transaction([
      prisma.question.create({
        data: {
          content: contentStr,
          contentHash: computeContentHash(contentStr),
          options: resolvedOptions as Prisma.InputJsonValue,
          correctAnswer: resolvedCorrectAnswer,
          explanation: resolvedExplanation,
          type: resolvedType as never,
          difficulty: (typeof difficulty === 'string' ? difficulty : 'MEDIUM') as never,
          subject: typeof subject === 'string' ? subject : null,
          class: typeof classLevel === 'string' ? classLevel : null,
          topic: typeof topic === 'string' ? topic : null,
          tags: Array.isArray(tags) ? (tags as string[]) : [],
          status: resolvedStatus as never,
          scope: 'PUBLIC',
          provenance: 'BOOK_SOURCED',
          reviewNotes: (typeof reviewNotes === 'string' ? reviewNotes : null) ?? (downgradeReason ? `Held for review, not auto-approved: ${downgradeReason}` : null),
          createdById: auth.user.id,
          bookId,
          bookChapterId: typeof bookChapterId === 'string' ? bookChapterId : null,
          printedNumber: resolvedPrintedNumber,
          sourcePageStart: resolvedSourcePageStart,
          sourcePageEnd: resolvedSourcePageEnd,
          sourceLocator: { consolidatedFrom: retireIds } as Prisma.InputJsonValue,
          verificationStatus: 'MATHEMATICALLY_VERIFIED',
          verifiedAt: new Date(),
        },
      }),
      ...(retireIds as string[]).map((id) =>
        prisma.question.update({
          where: { id },
          // QuestionStatus has no REJECTED member (DRAFT/PENDING_REVIEW/APPROVED/
          // REPORTED/ARCHIVED only) — ARCHIVED is the correct "retired, no longer
          // live, but not deleted" state for a row folded into a consolidation.
          data: { status: 'ARCHIVED', reviewNotes: retireNote },
        })
      ),
    ]);

    await recordAuditLog({
      actorId: auth.user.id,
      actorRole: 'ADMIN',
      action: 'QUESTION_CASE_STUDY_CONSOLIDATED',
      entityType: 'Question',
      entityId: created.id,
      metadata: { bookId, retiredIds: retireIds },
      ...requestAuditContext(request),
    });

    return NextResponse.json({ question: created, retired: retired.map((q) => q.id), downgradeReason });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Consolidation failed';
    console.error('Question consolidation failed:', error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
