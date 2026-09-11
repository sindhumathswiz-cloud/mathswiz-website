import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getAuthenticatedUser } from '@/lib/auth-server';
import { recordAuditLog, requestAuditContext } from '@/lib/audit-log';

export const runtime = 'nodejs';
export const maxDuration = 30;

/**
 * Manually assigns, reassigns, unassigns, or dismisses one captured
 * PageFigure -- the human-review counterpart to the automatic vertical-
 * position match in figure-question-match.ts. Every figure Mathpix detects
 * is captured regardless of whether extraction could place it (see
 * capturePageFigures in extract-questions/route.ts), so this is where a
 * miss (or a wrong auto-match) gets corrected without re-running OCR.
 *
 * PATCH body:
 *  - { questionId: string } -- attach this figure to that question. The
 *    question must belong to the same book (defense in depth against
 *    cross-book mix-ups from a stale UI).
 *  - { questionId: null }   -- unassign (e.g. undo a wrong auto/manual match).
 *  - { reviewed: true }     -- mark reviewed without changing the assignment
 *    (e.g. confirming an unmatched figure genuinely isn't worth attaching --
 *    a page border Mathpix mis-flagged as a diagram).
 * Any manual PATCH clears matchedAutomatically and stamps reviewedAt/
 * reviewedById, since a human has now looked at it either way.
 */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string; runId: string; figureId: string }> }) {
  const auth = await getAuthenticatedUser(['ADMIN']);
  if ('error' in auth) return auth.error;
  const { id, runId, figureId } = await params;

  const run = await prisma.bookIngestionRun.findFirst({ where: { id: runId, bookId: id }, select: { id: true } });
  if (!run) return NextResponse.json({ error: 'Book ingestion run not found' }, { status: 404 });

  const figure = await prisma.pageFigure.findFirst({ where: { id: figureId, bookId: id }, select: { id: true, questionId: true, pageNumber: true } });
  if (!figure) return NextResponse.json({ error: 'Figure not found' }, { status: 404 });

  const body = await request.json().catch(() => ({}));
  const hasQuestionId = Object.prototype.hasOwnProperty.call(body, 'questionId');
  const reviewedOnly = body.reviewed === true && !hasQuestionId;

  if (!hasQuestionId && !reviewedOnly) {
    return NextResponse.json({ error: 'Provide { questionId } (a string or null) or { reviewed: true }' }, { status: 400 });
  }

  let questionId: string | null = figure.questionId;
  if (hasQuestionId) {
    if (body.questionId === null) {
      questionId = null;
    } else if (typeof body.questionId === 'string') {
      const target = await prisma.question.findFirst({ where: { id: body.questionId, bookId: id }, select: { id: true } });
      if (!target) return NextResponse.json({ error: 'Question not found in this book' }, { status: 400 });
      questionId = target.id;
    } else {
      return NextResponse.json({ error: '"questionId" must be a string or null' }, { status: 400 });
    }
  }

  const updated = await prisma.pageFigure.update({
    where: { id: figureId },
    data: {
      questionId,
      matchedAutomatically: false,
      reviewedAt: new Date(),
      reviewedById: auth.user.id,
    },
    select: { id: true, questionId: true, matchedAutomatically: true, reviewedAt: true },
  });

  await recordAuditLog({
    actorId: auth.user.id,
    actorRole: 'ADMIN',
    action: 'BOOK_FIGURE_ASSIGNED',
    entityType: 'PageFigure',
    entityId: figureId,
    metadata: { bookId: id, pageNumber: figure.pageNumber, previousQuestionId: figure.questionId, questionId },
    ...requestAuditContext(request),
  });

  return NextResponse.json({ figure: updated });
}
