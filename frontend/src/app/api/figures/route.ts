import { NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/auth-server';
import { displayableFigures } from '@/lib/figure-display';

export const dynamic = 'force-dynamic';

/** GET ?questionIds=a,b,c -> { [questionId]: [{ url, caption }] }: the figures to show under each (lib/figure-display). */
export async function GET(request: Request) {
  const auth = await getAuthenticatedUser();
  if ('error' in auth) return auth.error;
  const ids = (new URL(request.url).searchParams.get('questionIds') ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  const figures = await displayableFigures(ids, { includeUnapproved: auth.user.role === 'ADMIN' });
  return NextResponse.json({ figures }, { headers: { 'Cache-Control': 'private, max-age=300' } });
}
