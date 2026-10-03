import { timingSafeEqual } from 'node:crypto';
import { NextResponse } from 'next/server';
import { recordAuditLog } from '@/lib/audit-log';
import { purgeExpiredDrafts } from '@/lib/draft-retention';

export const runtime = 'nodejs';
export const maxDuration = 300;

/**
 * Scheduled sweep that deletes extracted-page drafts once they pass their
 * 60-day retention. Point any daily scheduler at it (Vercel Cron sends
 * `Authorization: Bearer $CRON_SECRET` automatically).
 *
 * This path is public to the session layer (see api-authorization.ts) because
 * a scheduler has no session; it authenticates with CRON_SECRET instead and
 * fails closed -- with no secret configured nothing can call it.
 */
function authorised(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const provided = Buffer.from(request.headers.get('authorization') ?? '');
  const expected = Buffer.from(`Bearer ${secret}`);
  return provided.length === expected.length && timingSafeEqual(provided, expected);
}

export async function GET(request: Request) {
  if (!authorised(request)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const result = await purgeExpiredDrafts({ limit: 10 });
  if (result.purged.length > 0) {
    await recordAuditLog({
      actorId: null, actorRole: 'SYSTEM', action: 'BOOK_DRAFTS_PURGED', entityType: 'BookIngestionRun', entityId: result.purged[0].runId,
      metadata: { purged: result.purged, trigger: 'SCHEDULE' },
    });
  }
  return NextResponse.json({ purged: result.purged.length, runs: result.purged });
}
