import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { requirePremiumTeacher } from '@/lib/teacher-api-guard';
import { loadQuestionSources } from '@/lib/question-sources';

export const dynamic = 'force-dynamic';

/**
 * The book -> chapter -> exercise tree for the teacher's question selectors,
 * with how many approved questions sit under each node. Premium teachers (and
 * admins), like the question bank it filters.
 */
export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    const guard = await requirePremiumTeacher(session);
    if (!guard.ok) return guard.response;
    return NextResponse.json({ books: await loadQuestionSources() });
  } catch (error) {
    console.error('[GET /api/teacher/question-sources]', error);
    return NextResponse.json({ error: 'Failed to load question sources' }, { status: 500 });
  }
}
