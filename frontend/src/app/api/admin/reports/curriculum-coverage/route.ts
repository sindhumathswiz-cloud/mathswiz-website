import { NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/auth-server';
import { crossBookReconciliationSummary } from '@/lib/exercise-reconciliation';

export const dynamic = 'force-dynamic';

export async function GET() {
  const auth = await getAuthenticatedUser(['ADMIN']);
  if ('error' in auth) return auth.error;

  const { books, platform } = await crossBookReconciliationSummary();
  return NextResponse.json({ books, platform });
}
