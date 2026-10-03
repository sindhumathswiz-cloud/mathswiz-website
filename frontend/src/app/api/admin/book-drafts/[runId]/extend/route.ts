import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getAuthenticatedUser } from '@/lib/auth-server';
import { recordAuditLog, requestAuditContext } from '@/lib/audit-log';
import { DRAFT_RETENTION_DAYS, startDraftClock } from '@/lib/draft-retention';

export const runtime = 'nodejs';

/** Restarts the draft's retention clock: it will be kept DRAFT_RETENTION_DAYS from now. */
export async function POST(request: Request, { params }: { params: Promise<{ runId: string }> }) {
  const auth = await getAuthenticatedUser(['ADMIN']);
  if ('error' in auth) return auth.error;
  const { runId } = await params;

  const run = await prisma.bookIngestionRun.findUnique({ where: { id: runId }, select: { id: true, bookId: true, draftPurgedAt: true } });
  if (!run) return NextResponse.json({ error: 'Draft not found' }, { status: 404 });
  if (run.draftPurgedAt) return NextResponse.json({ error: 'This draft was already deleted; re-render the book from its PDF to build a new one' }, { status: 409 });

  const expiresAt = await startDraftClock(run.id);
  await recordAuditLog({
    actorId: auth.user.id, actorRole: 'ADMIN', action: 'BOOK_DRAFT_EXTENDED', entityType: 'BookIngestionRun', entityId: run.id,
    metadata: { bookId: run.bookId, expiresAt, retentionDays: DRAFT_RETENTION_DAYS }, ...requestAuditContext(request),
  });
  return NextResponse.json({ expiresAt });
}
