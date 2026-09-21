import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getAuthenticatedUser } from '@/lib/auth-server';
import { recordAuditLog, requestAuditContext } from '@/lib/audit-log';
import { bookReconciliationReport, reconcileBook, type ExerciseReconciliationRow } from '@/lib/exercise-reconciliation';

export const runtime = 'nodejs';
export const maxDuration = 120;

/**
 * The admin-visible per-exercise reconciliation report: for every confirmed,
 * question-bearing exercise, expected/extracted/matched/unresolved counts
 * and why it isn't clean yet (see lib/exercise-reconciliation.ts).
 *
 *  - GET   returns the report from the last reconciliation, no recompute --
 *          cheap, safe to call on every page load.
 *  - POST  recomputes every exercise's counts from its confirmed page range,
 *          persists them, and returns the fresh report. This is what the
 *          completion gate (.../ingestions/[runId]/complete) also calls
 *          before deciding whether the book may be marked complete.
 *  - PATCH { exerciseId, expectedQuestionCount } sets the one count nothing
 *          else can derive -- how many questions this exercise SHOULD have,
 *          normally read off the printed book/table of contents by a human.
 */

function summarize(rows: ExerciseReconciliationRow[]) {
  return {
    exerciseCount: rows.length,
    discrepantCount: rows.filter((r) => r.discrepancies.length > 0).length,
    totalExpected: rows.reduce((sum, r) => sum + (r.expectedQuestionCount ?? 0), 0),
    totalExtracted: rows.reduce((sum, r) => sum + r.extractedQuestionCount, 0),
    totalMatched: rows.reduce((sum, r) => sum + r.matchedQuestionCount, 0),
    totalUnresolved: rows.reduce((sum, r) => sum + r.unresolvedQuestionCount, 0),
  };
}

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await getAuthenticatedUser(['ADMIN']);
  if ('error' in auth) return auth.error;
  const { id } = await params;

  const book = await prisma.book.findUnique({ where: { id }, select: { id: true } });
  if (!book) return NextResponse.json({ error: 'Book not found' }, { status: 404 });

  const exercises = await bookReconciliationReport(id);
  return NextResponse.json({ exercises, summary: summarize(exercises) });
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await getAuthenticatedUser(['ADMIN']);
  if ('error' in auth) return auth.error;
  const { id } = await params;

  const book = await prisma.book.findUnique({ where: { id }, select: { id: true } });
  if (!book) return NextResponse.json({ error: 'Book not found' }, { status: 404 });

  const exercises = await reconcileBook(id);
  const summary = summarize(exercises);

  await recordAuditLog({
    actorId: auth.user.id,
    actorRole: 'ADMIN',
    action: 'BOOK_RECONCILED',
    entityType: 'Book',
    entityId: id,
    metadata: summary,
    ...requestAuditContext(request),
  });

  return NextResponse.json({ exercises, summary });
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await getAuthenticatedUser(['ADMIN']);
  if ('error' in auth) return auth.error;
  const { id } = await params;

  const body = await request.json().catch(() => ({}));
  const { exerciseId, expectedQuestionCount } = body as { exerciseId?: unknown; expectedQuestionCount?: unknown };
  if (typeof exerciseId !== 'string' || !exerciseId) {
    return NextResponse.json({ error: 'exerciseId is required' }, { status: 400 });
  }
  if (expectedQuestionCount !== null && !Number.isInteger(expectedQuestionCount)) {
    return NextResponse.json({ error: 'expectedQuestionCount must be an integer or null' }, { status: 400 });
  }

  // Belt-and-suspenders: confirm the exercise actually belongs to this book
  // before writing, so a stale client can't set counts on another book's row.
  const exercise = await prisma.bookExercise.findFirst({
    where: { id: exerciseId, chapter: { bookId: id } },
    select: { id: true },
  });
  if (!exercise) return NextResponse.json({ error: 'Exercise not found in this book' }, { status: 404 });

  await prisma.bookExercise.update({
    where: { id: exerciseId },
    data: { expectedQuestionCount: expectedQuestionCount as number | null },
  });

  await recordAuditLog({
    actorId: auth.user.id,
    actorRole: 'ADMIN',
    action: 'BOOK_EXERCISE_EXPECTED_COUNT_SET',
    entityType: 'BookExercise',
    entityId: exerciseId,
    metadata: { bookId: id, expectedQuestionCount },
    ...requestAuditContext(request),
  });

  const exercises = await bookReconciliationReport(id);
  return NextResponse.json({ exercises, summary: summarize(exercises) });
}
