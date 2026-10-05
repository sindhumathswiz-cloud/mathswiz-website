import { NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/auth-server';
import { loadProviderPilot } from '@/lib/provider-pilot-data';

export const runtime = 'nodejs';

/** The provider purchase gate: what has been measured, what has not, and the verdict that follows. Read-only; spends nothing. */
export async function GET() {
  const auth = await getAuthenticatedUser(['ADMIN']);
  if ('error' in auth) return auth.error;
  return NextResponse.json(await loadProviderPilot());
}
