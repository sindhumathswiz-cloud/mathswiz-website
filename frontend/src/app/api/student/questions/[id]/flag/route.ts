import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { recordAuditLog, requestAuditContext } from '@/lib/audit-log';

export const dynamic = 'force-dynamic';

/**
 * A student reporting a question as incorrect (wrong answer, bad options,
 * typo, etc.) -- distinct from the "Save for Later" bookmark
 * (MistakeNotebookEntry) which has no correctness signal at all. Creates a
 * QuestionFlag so admin can see who reported it and why, and pulls the
 * question out of the live APPROVED pool while under review (mirrors how
 * admin QA rejection already uses REPORTED).
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id || session.user.role !== 'STUDENT') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const studentId = session.user.id;
    const { id: questionId } = await params;

    const body = await request.json().catch(() => null);
    const reason = typeof body?.reason === 'string' ? body.reason.trim().slice(0, 2000) : '';
    if (!reason) {
      return NextResponse.json({ error: 'A reason is required' }, { status: 400 });
    }

    const question = await prisma.question.findFirst({
      where: { id: questionId, status: { in: ['APPROVED', 'PENDING_REVIEW'] }, scope: 'PUBLIC' },
      select: { id: true, status: true, reportedIssues: true },
    });
    if (!question) {
      return NextResponse.json({ error: 'Question not found or unavailable' }, { status: 404 });
    }

    const flag = await prisma.$transaction(async (tx) => {
      const created = await tx.questionFlag.create({
        data: { questionId, flaggedById: studentId, reason },
      });
      // Pull it from the live pool while under review -- but don't clobber
      // a question that's already PENDING_REVIEW for an unrelated reason.
      if (question.status === 'APPROVED') {
        await tx.question.update({
          where: { id: questionId },
          data: {
            status: 'REPORTED',
            reportedIssues: question.reportedIssues
              ? `${question.reportedIssues}\n\nStudent-reported: ${reason}`
              : `Student-reported: ${reason}`,
          },
        });
      }
      return created;
    });

    await recordAuditLog({
      actorId: studentId,
      actorRole: 'STUDENT',
      action: 'QUESTION_FLAGGED',
      entityType: 'Question',
      entityId: questionId,
      metadata: { flagId: flag.id, reason },
      ...requestAuditContext(request),
    });

    return NextResponse.json({ success: true, flag });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to flag question' }, { status: 500 });
  }
}
