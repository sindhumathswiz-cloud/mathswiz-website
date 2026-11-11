import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { recordAuditLog, requestAuditContext } from '@/lib/audit-log';
import type { Prisma } from '@prisma/client';
import { parseBrowserFilters } from '@/lib/question-browser';
import { browserFacets, browserSources, filteredWhere } from '@/lib/question-browser-server';

const FLAG_STATUSES = ['PENDING', 'CORRECTED', 'REJECTED'] as const;

export const dynamic = 'force-dynamic';

/**
 * Admin-facing list of flagged questions: student "flag as incorrect" reports, and flags an admin or a review check
 * raised (POST below). Filtered like the question bank (lib/question-browser) and by who raised the flag
 * (?raisedBy=student|review), one page at a time, with counts per flag status and, with ?facets=1, per question
 * type, difficulty and topic.
 * Defaults to PENDING so the admin dashboard surfaces what needs action;
 * pass ?status=ALL (or CORRECTED/REJECTED) to see resolved history.
 */
export async function GET(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id || session.user.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const params = new URL(request.url).searchParams;
    const statusParam = params.get('status');
    const status = statusParam && (FLAG_STATUSES as readonly string[]).includes(statusParam) ? statusParam : undefined;

    // The same question filters as the question bank (any question status), plus who raised the flag.
    const filters = { ...parseBrowserFilters(params), status: 'ALL' };
    const viewer = { userId: session.user.id, role: 'ADMIN' };
    const sources = await browserSources(filters);
    const raisedBy = params.get('raisedBy');
    const raiser: Prisma.QuestionFlagWhereInput = raisedBy === 'student' ? { flaggedBy: { role: 'STUDENT' } }
      : raisedBy === 'review' ? { flaggedBy: { role: { not: 'STUDENT' } } } : {};
    const where: Prisma.QuestionFlagWhereInput = { ...(status ? { status: status as Prisma.EnumQuestionFlagStatusFilter['equals'] } : {}), ...raiser, question: filteredWhere(filters, viewer, sources) };

    const [total, flags, byStatus, facets] = await Promise.all([
      prisma.questionFlag.count({ where }),
      prisma.questionFlag.findMany({
        where,
        orderBy: params.get('sort') === 'book'
          ? [{ question: { book: { title: 'asc' } } }, { question: { sourcePageStart: 'asc' } }, { createdAt: 'desc' }]
          : { createdAt: 'desc' },
        skip: (filters.page - 1) * filters.pageSize,
        take: filters.pageSize,
        include: {
          question: {
            select: {
              id: true, content: true, options: true, correctAnswer: true, explanation: true, type: true, status: true, topic: true, subject: true, difficulty: true,
              printedNumber: true, sourcePageStart: true, book: { select: { title: true } }, bookChapter: { select: { name: true, chapterNumber: true } },
            },
          },
          flaggedBy: { select: { id: true, firstName: true, lastName: true, email: true, role: true } },
          resolvedBy: { select: { id: true, firstName: true, lastName: true } },
        },
      }),
      // How many flags each status tab would show with the other filters kept.
      prisma.questionFlag.groupBy({ by: ['status'], where: { ...raiser, question: filteredWhere(filters, viewer, sources) }, _count: { _all: true } }),
      params.get('facets') === '1'
        ? browserFacets(filters, viewer, sources, [{ flags: { some: { ...(status ? { status: status as Prisma.EnumQuestionFlagStatusFilter['equals'] } : {}), ...raiser } } }])
        : Promise.resolve(undefined),
    ]);
    const statusCounts = Object.fromEntries(byStatus.map((s) => [s.status, s._count._all]));

    return NextResponse.json({ flags, total, page: filters.page, pageSize: filters.pageSize, statusCounts, facets });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to load flagged questions' }, { status: 500 });
  }
}

/**
 * An admin (or a review check run as one) flagging a question for a person to fix -- e.g. maths that does not display.
 * Unlike a student's flag it leaves the question's status alone: it is not pulled from or returned to the live pool,
 * and resolving it later does not approve it (see [id]/route.ts). One pending flag per question.
 */
export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id || session.user.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const body = await request.json().catch(() => null);
    const questionId = typeof body?.questionId === 'string' ? body.questionId : '';
    const reason = typeof body?.reason === 'string' ? body.reason.trim().slice(0, 2000) : '';
    if (!questionId || !reason) {
      return NextResponse.json({ error: 'questionId and reason are required' }, { status: 400 });
    }

    const question = await prisma.question.findUnique({ where: { id: questionId }, select: { id: true } });
    if (!question) return NextResponse.json({ error: 'Question not found' }, { status: 404 });
    const pending = await prisma.questionFlag.findFirst({ where: { questionId, status: 'PENDING' }, select: { id: true } });
    if (pending) {
      return NextResponse.json({ error: 'This question already has a pending flag', flagId: pending.id }, { status: 409 });
    }

    const flag = await prisma.questionFlag.create({ data: { questionId, flaggedById: session.user.id, reason } });
    await recordAuditLog({
      actorId: session.user.id,
      actorRole: 'ADMIN',
      action: 'QUESTION_FLAGGED',
      entityType: 'Question',
      entityId: questionId,
      metadata: { flagId: flag.id, reason },
      ...requestAuditContext(request),
    });
    return NextResponse.json({ success: true, flag }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to flag question' }, { status: 500 });
  }
}
