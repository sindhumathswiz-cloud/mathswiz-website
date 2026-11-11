import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { requirePremiumTeacher } from '@/lib/teacher-api-guard';
import { browserOrder, browserWhere, parseBrowserFilters } from '@/lib/question-browser';
import { browserFacets, browserSources } from '@/lib/question-browser-server';

export const dynamic = 'force-dynamic';

/**
 * The question browser: one page of questions matching the filters (lib/question-browser), newest or in book
 * order, with the total. With ?facets=1 it also counts the matches per type, difficulty and topic, each with every
 * other filter kept, so the filter controls can show what a choice would give. Premium teachers and admins.
 */
export async function GET(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    const guard = await requirePremiumTeacher(session);
    if (!guard.ok) return guard.response;

    const params = new URL(request.url).searchParams;
    const filters = parseBrowserFilters(params);
    const viewer = { userId: guard.userId, role: guard.role };
    const sources = await browserSources(filters);
    const where = browserWhere(filters, viewer, sources);

    const [total, rows] = await Promise.all([
      prisma.question.count({ where }),
      prisma.question.findMany({
        where,
        orderBy: browserOrder(filters.sort),
        skip: (filters.page - 1) * filters.pageSize,
        take: filters.pageSize,
        select: {
          id: true, content: true, options: true, correctAnswer: true, explanation: true, type: true, difficulty: true,
          class: true, topic: true, status: true, verificationStatus: true, printedNumber: true, sourcePageStart: true,
          createdById: true,
          book: { select: { title: true, className: true } },
          bookChapter: { select: { name: true, chapterNumber: true } },
          solution: { select: { content: true } },
        },
      }),
    ]);

    const questions = rows.map(({ solution, createdById, ...q }) => ({
      ...q,
      // A worked solution is either the question's own explanation or a separate Solution row.
      explanation: q.explanation?.trim() ? q.explanation : solution?.content ?? null,
      mine: createdById === guard.userId,
    }));

    const facets = params.get('facets') === '1' ? await browserFacets(filters, viewer, sources) : undefined;

    return NextResponse.json({ questions, total, page: filters.page, pageSize: filters.pageSize, facets });
  } catch (error) {
    console.error('[GET /api/teacher/question-browser]', error);
    return NextResponse.json({ error: 'Could not load questions' }, { status: 500 });
  }
}
