import { NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/auth-server';
import { recordAuditLog, requestAuditContext } from '@/lib/audit-log';
import { purgeExpiredDrafts } from '@/lib/draft-retention';

export const runtime = 'nodejs';
export const maxDuration = 120;

/**
 * Admin-triggered sweep of drafts that are already past their expiry -- the
 * same operation the scheduled job runs. Never touches a draft that has time
 * left. `{ dryRun: true }` lists what would be deleted without deleting it.
 */
export async function POST(request: Request) {
  const auth = await getAuthenticatedUser(['ADMIN']);
  if ('error' in auth) return auth.error;
  const body = await request.json().catch(() => ({}));
  const dryRun = body.dryRun === true;

  const result = await purgeExpiredDrafts({ dryRun });
  if (!dryRun && result.purged.length > 0) {
    await recordAuditLog({
      actorId: auth.user.id, actorRole: 'ADMIN', action: 'BOOK_DRAFTS_PURGED', entityType: 'BookIngestionRun', entityId: result.purged[0].runId,
      metadata: { purged: result.purged, trigger: 'ADMIN' }, ...requestAuditContext(request),
    });
  }
  return NextResponse.json(result);
}
