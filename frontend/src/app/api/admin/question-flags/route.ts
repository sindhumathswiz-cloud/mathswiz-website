import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { recordAuditLog, requestAuditContext } from '@/lib/audit-log';

export const dynamic = 'force-dynamic';

/**
 * Admin-facing list of flagged questions: student "flag as incorrect" reports, and flags an admin or a review check
 * raised (POST below).
 * Defaults to PENDING so the admin dashboard surfaces what needs action;
 * pass ?status=ALL (or CORRECTED/REJECTED) to see resolved history.
 */
export async function GET(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id || session.user.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const statusParam = new URL(request.url).searchParams.get('status');
    const status = statusParam && statusParam !== 'ALL' ? statusParam : undefined;

    const flags = await prisma.questionFlag.findMany({
      where: status ? { status: status as any } : undefined,
      orderBy: { createdAt: 'desc' },
      take: 200,
      include: {
        question: {
          select: { id: true, content: true, options: true, correctAnswer: true, explanation: true, type: true, status: true, topic: true, subject: true, difficulty: true },
        },
        flaggedBy: { select: { id: true, firstName: true, lastName: true, email: true, role: true } },
        resolvedBy: { select: { id: true, firstName: true, lastName: true } },
      },
    });

    return NextResponse.json({ flags });
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
