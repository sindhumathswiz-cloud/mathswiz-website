import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { recordAuditLog, requestAuditContext } from '@/lib/audit-log';

export const dynamic = 'force-dynamic';

/**
 * Admin resolving a student's "flag as incorrect" report: either the
 * question genuinely had an error (CORRECTED -- optionally saving edited
 * content in the same request) or the flag was invalid (REJECTED, question
 * was fine as-is). Either way the question returns to APPROVED (it was
 * pulled to REPORTED when flagged) and the reporting student gets a
 * Notification -- see lib/mastery.ts-adjacent precedent in
 * api/teacher/interventions/[id]/route.ts for this same
 * transaction+notification pattern.
 */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id || session.user.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const adminId = session.user.id;
    const { id: flagId } = await params;

    const body = await request.json().catch(() => null);
    const action = body?.action;
    if (action !== 'CORRECTED' && action !== 'REJECTED') {
      return NextResponse.json({ error: 'action must be CORRECTED or REJECTED' }, { status: 400 });
    }
    const resolution = typeof body?.resolution === 'string' ? body.resolution.trim().slice(0, 2000) : null;
    const questionUpdate = body?.questionUpdate;

    const flag = await prisma.questionFlag.findUnique({ where: { id: flagId }, select: { id: true, questionId: true, flaggedById: true, status: true } });
    if (!flag) return NextResponse.json({ error: 'Flag not found' }, { status: 404 });
    if (flag.status !== 'PENDING') return NextResponse.json({ error: 'This flag has already been resolved' }, { status: 400 });

    const resolvedFlag = await prisma.$transaction(async (tx) => {
      const updated = await tx.questionFlag.update({
        where: { id: flagId },
        data: { status: action, resolution, resolvedById: adminId, resolvedAt: new Date() },
      });

      const questionData: Record<string, unknown> = { status: 'APPROVED' };
      if (action === 'CORRECTED' && questionUpdate && typeof questionUpdate === 'object') {
        if (typeof questionUpdate.content === 'string') questionData.content = questionUpdate.content;
        if (typeof questionUpdate.correctAnswer === 'string') questionData.correctAnswer = questionUpdate.correctAnswer;
        if (typeof questionUpdate.explanation === 'string') questionData.explanation = questionUpdate.explanation;
        if (Array.isArray(questionUpdate.options)) questionData.options = questionUpdate.options;
      }
      await tx.question.update({ where: { id: flag.questionId }, data: questionData });

      const message = action === 'CORRECTED'
        ? `The question you flagged was reviewed and corrected.${resolution ? ` Admin note: ${resolution}` : ''}`
        : `The question you flagged was reviewed and no error was found.${resolution ? ` Admin note: ${resolution}` : ''}`;
      await tx.notification.create({
        data: {
          userId: flag.flaggedById,
          title: action === 'CORRECTED' ? 'Your flagged question was corrected' : 'Your flagged question was reviewed',
          message,
          type: 'QUESTION_FLAG_RESOLVED',
          targetRole: 'STUDENT',
        },
      });

      return updated;
    });

    await recordAuditLog({
      actorId: adminId,
      actorRole: 'ADMIN',
      action: 'QUESTION_FLAG_RESOLVED',
      entityType: 'QuestionFlag',
      entityId: flagId,
      metadata: { resolution: action, questionId: flag.questionId },
      ...requestAuditContext(request),
    });

    return NextResponse.json({ success: true, flag: resolvedFlag });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to resolve flag' }, { status: 500 });
  }
}
