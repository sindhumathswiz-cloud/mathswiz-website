import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import type { Prisma } from '@prisma/client';
import { getAuthenticatedUser } from '@/lib/auth-server';
import { assessQuestionsRisk } from '@/lib/question-risk';

export const dynamic = 'force-dynamic';

const PAGE_SIZE = 24;
// How many open candidates to pull and risk-assess before filtering/sorting
// -- risk-sorting can't happen in the database (it's computed, not stored),
// so this bounds the cost of a page load instead of scoring every open
// question in the bank. poolCapped in the response says when this limit
// was actually hit, so a very large backlog is visible, not silently
// truncated.
const POOL_CAP = 500;

const FLAG_TAGS = ['Second-Review: Flagged', 'AI-Verified: Flagged'];

/**
 * The human review queue: every open (DRAFT/REPORTED/PENDING_REVIEW)
 * question that either the deterministic gates flag as not yet approvable
 * (Roadmap Phase 3 -- see lib/question-risk.ts, composing the provenance,
 * structural QA, and figure gates built for Issues 7-9), or that's already
 * marked NEEDS_REVIEW / tagged by the manual second review or the automated
 * AI-assisted verification pass. Sorted riskiest first, so a reviewer's
 * attention goes where it's most needed instead of an arbitrary id order --
 * each row carries its own risk.blockers, the exact reasons it isn't
 * approvable yet, computed the same way approval itself would reject it.
 *
 * PENDING_REVIEW is included alongside DRAFT/REPORTED because that's
 * exactly where the approval gates land a question they downgrade (see
 * api/questions/route.ts and bulk-approve/route.ts) -- before this, those
 * downgraded rows had no review surface at all.
 */
export async function GET(request: Request) {
  const auth = await getAuthenticatedUser(['ADMIN']);
  if ('error' in auth) return auth.error;

  const params = new URL(request.url).searchParams;
  const bookId = params.get('bookId') || undefined;
  const search = params.get('search')?.trim() || undefined;
  const cursor = params.get('cursor') || undefined;

  const where: Prisma.QuestionWhereInput = {
    status: { in: ['DRAFT', 'REPORTED', 'PENDING_REVIEW'] },
    ...(bookId ? { bookId } : {}),
    ...(search ? { content: { contains: search, mode: 'insensitive' } } : {}),
  };

  const candidates = await prisma.question.findMany({
    where,
    take: POOL_CAP,
    select: {
      id: true,
      content: true,
      options: true,
      correctAnswer: true,
      explanation: true,
      type: true,
      status: true,
      verificationStatus: true,
      provenance: true,
      bookId: true,
      sourcePageStart: true,
      sourcePageEnd: true,
      printedNumber: true,
      confidence: true,
      tags: true,
      reviewNotes: true,
      topic: true,
      subTopic: true,
      book: { select: { title: true } },
    },
  });

  const riskById = await assessQuestionsRisk(candidates.map((q) => ({
    ...q,
    options: Array.isArray(q.options) ? q.options as string[] : undefined,
    correctAnswer: q.correctAnswer,
    explanation: q.explanation,
  })));

  const flagged = candidates.filter((q) => {
    const risk = riskById.get(q.id)!;
    return risk.blockers.length > 0 || q.verificationStatus === 'NEEDS_REVIEW' || q.tags.some((t) => FLAG_TAGS.includes(t));
  });
  flagged.sort((a, b) => riskById.get(a.id)!.score - riskById.get(b.id)!.score);

  const offset = cursor ? Math.max(0, Number.parseInt(cursor, 10) || 0) : 0;
  const page = flagged.slice(offset, offset + PAGE_SIZE).map((q) => ({ ...q, risk: riskById.get(q.id) }));
  const nextCursor = offset + PAGE_SIZE < flagged.length ? String(offset + PAGE_SIZE) : null;

  return NextResponse.json({
    questions: page,
    nextCursor,
    poolSize: candidates.length,
    poolCapped: candidates.length >= POOL_CAP,
  });
}
