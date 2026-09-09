import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getAuthenticatedUser } from '@/lib/auth-server';
import { recordAuditLog, requestAuditContext } from '@/lib/audit-log';

export const runtime = 'nodejs';
export const maxDuration = 60;

/**
 * Discards Question.printedNumber off every DRAFT question in this book.
 *
 * printedNumber only ever exists to let a number-based matching pass
 * (match-answer-keys, match-detailed-solutions, and any future one) find a
 * question again by its own book-printed serial number, so it can backfill
 * a correctAnswer/explanation/topic printed elsewhere in the chapter. It was
 * never meant to be kept in the stored data once that job is done -- per
 * Sindhu's own instruction, the number is a means to an end, not something
 * to persist.
 *
 * Deliberately a SEPARATE, explicit step rather than something each matching
 * pass does for itself: with more than one matching pass depending on the
 * same field, whichever pass cleared it first would silently starve every
 * pass that runs after it. Call this once, after every matching pass you
 * intend to run against this book has been run (dry-run first is fine --
 * only { apply: true } calls on the matching passes actually write).
 *
 * No `apply` flag here -- unlike the matching passes, there's nothing to
 * preview: this route only ever does the one unambiguous thing (null out an
 * already-served-its-purpose field), so a dry-run mode would just be
 * `SELECT COUNT(*)` dressed up as a POST. It stays a POST (not GET) because
 * it writes.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string; runId: string }> }) {
  const auth = await getAuthenticatedUser(['ADMIN']);
  if ('error' in auth) return auth.error;
  const { id, runId } = await params;

  const run = await prisma.bookIngestionRun.findFirst({
    where: { id: runId, bookId: id },
    select: { id: true },
  });
  if (!run) return NextResponse.json({ error: 'Book ingestion run not found' }, { status: 404 });

  const cleared = await prisma.question.updateMany({
    where: { bookId: id, status: 'DRAFT', printedNumber: { not: null } },
    data: { printedNumber: null },
  });

  await recordAuditLog({
    actorId: auth.user.id,
    actorRole: 'ADMIN',
    action: 'BOOK_PRINTED_NUMBERS_CLEARED',
    entityType: 'BookIngestionRun',
    entityId: run.id,
    metadata: { bookId: id, printedNumbersCleared: cleared.count },
    ...requestAuditContext(request),
  });

  return NextResponse.json({ printedNumbersCleared: cleared.count });
}
