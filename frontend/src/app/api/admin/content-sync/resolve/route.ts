import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { syncConnection } from '@/lib/content-sync/config';
import { resolveConflict } from '@/lib/content-sync/run';

export const dynamic = 'force-dynamic';

/** Settles one conflict: { table, id, keep: 'staging' | 'live' }. */
export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id || session.user.role !== 'ADMIN') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const connection = syncConnection();
  if (!connection.ready) return NextResponse.json({ error: connection.reason }, { status: 409 });

  const body = await request.json().catch(() => null);
  const table = typeof body?.table === 'string' ? body.table : '';
  const id = typeof body?.id === 'string' ? body.id : '';
  const keep = body?.keep === 'staging' || body?.keep === 'live' ? body.keep : null;
  if (!table || !id || !keep) return NextResponse.json({ error: 'table, id and keep ("staging" or "live") are required' }, { status: 400 });

  try {
    const result = await resolveConflict({ stagingUrl: connection.stagingUrl, liveUrl: connection.liveUrl, table, id, keep, triggeredBy: `admin:${session.user.id}` });
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 400 });
  }
}
