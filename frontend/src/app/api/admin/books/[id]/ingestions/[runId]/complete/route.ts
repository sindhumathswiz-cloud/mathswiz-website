import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getAuthenticatedUser } from '@/lib/auth-server';
import { recordAuditLog, requestAuditContext } from '@/lib/audit-log';
import { reconcileBook } from '@/lib/exercise-reconciliation';

export const runtime = 'nodejs';
export const maxDuration = 120;

/**
 * The completion gate: the one action that marks a book's ingestion run
 * BookIngestionStage.COMPLETED -- a stage every run's `stage` field has
 * always been able to hold, but nothing in the pipeline ever set (the
 * furthest extract-questions/route.ts reaches on its own is REVIEW_READY,
 * "every rendered page has been attempted"). That's a materially weaker
 * claim than "this book is actually done": a run can be REVIEW_READY, or
 * even ExtractionStatus.COMPLETED, while whole exercises are still missing
 * questions or sitting on unmatched answers -- exactly what this route
 * exists to catch before anyone treats the book as finished.
 *
 * Refuses (409) rather than completing when:
 *  - any chapter's manifest isn't confirmed yet (the book's own structure
 *    isn't finalized, so there's nothing reliable to reconcile against), or
 *  - reconcileBook (a fresh recompute, never stale stored counts) finds any
 *    exercise with a discrepancy -- see lib/exercise-reconciliation.ts.
 * Both leave the run exactly where it was; nothing here is destructive.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string; runId: string }> }) {
  const auth = await getAuthenticatedUser(['ADMIN']);
  if ('error' in auth) return auth.error;
  const { id, runId } = await params;

  const run = await prisma.bookIngestionRun.findFirst({ where: { id: runId, bookId: id }, select: { id: true, stage: true, completedAt: true } });
  if (!run) return NextResponse.json({ error: 'Book ingestion run not found' }, { status: 404 });

  if (run.stage === 'COMPLETED') {
    return NextResponse.json({ success: true, stage: run.stage, alreadyComplete: true });
  }

  const [totalChapters, unconfirmedChapters] = await Promise.all([
    prisma.bookChapter.count({ where: { bookId: id } }),
    prisma.bookChapter.count({ where: { bookId: id, manifestConfirmedAt: null } }),
  ]);
  if (totalChapters === 0 || unconfirmedChapters > 0) {
    return NextResponse.json({
      error: totalChapters === 0
        ? 'This book has no chapters yet -- there is nothing to reconcile.'
        : `${unconfirmedChapters} chapter(s) have not had their manifest confirmed yet -- confirm every chapter before marking this book complete.`,
      unconfirmedChapters,
    }, { status: 409 });
  }

  const exercises = await reconcileBook(id);
  if (exercises.length === 0) {
    return NextResponse.json({
      error: 'No confirmed, question-bearing exercise was found to reconcile against -- add and confirm this book\'s exercises before marking it complete.',
    }, { status: 409 });
  }
  const discrepant = exercises.filter((e) => e.discrepancies.length > 0);
  if (discrepant.length > 0) {
    return NextResponse.json({
      error: `${discrepant.length} exercise(s) have unresolved discrepancies -- left in review rather than marking the book complete.`,
      discrepancies: discrepant,
    }, { status: 409 });
  }

  const updated = await prisma.bookIngestionRun.update({
    where: { id: run.id },
    data: { stage: 'COMPLETED', completedAt: run.completedAt ?? new Date() },
    select: { stage: true, completedAt: true },
  });

  await recordAuditLog({
    actorId: auth.user.id,
    actorRole: 'ADMIN',
    action: 'BOOK_INGESTION_COMPLETED',
    entityType: 'BookIngestionRun',
    entityId: run.id,
    metadata: { bookId: id, exerciseCount: exercises.length },
    ...requestAuditContext(request),
  });

  return NextResponse.json({ success: true, stage: updated.stage, completedAt: updated.completedAt });
}
