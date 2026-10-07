import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { recordAuditLog, requestAuditContext } from '@/lib/audit-log';
import { isPremiumSubscription } from '@/lib/subscription';
import { markableTestsFor } from '@/lib/written-review';
import { roundMarks } from '@/lib/exam-patterns';

export async function PATCH(req: Request, { params }: { params: Promise<{ responseId: string }> }) {
  const session = await getServerSession(authOptions);
  const teacherId = session?.user?.id;
  if (!teacherId || session.user.role !== 'TEACHER') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const caller = await prisma.user.findUnique({ where: { id: teacherId }, select: { subscription: true } });
  if (!isPremiumSubscription(caller?.subscription)) {
    return NextResponse.json({ error: 'This feature requires a premium subscription.' }, { status: 403 });
  }

  const { responseId } = await params;
  const existing = await prisma.testResponse.findFirst({
    where: {
      id: responseId,
      reviewStatus: { in: ['PENDING', 'REVIEWED'] },
      attempt: { test: markableTestsFor(teacherId) },
    },
    select: { id: true, attemptId: true, questionId: true, attempt: { select: { testId: true } } },
  });
  if (!existing) return NextResponse.json({ error: 'Submission not found' }, { status: 404 });

  // No more than the question is worth in its section (a 5-mark answer cannot be given 50).
  const placement = existing.attempt?.testId
    ? await prisma.testQuestion.findFirst({
        where: { questionId: existing.questionId, section: { testId: existing.attempt.testId } },
        select: { section: { select: { marksPerQuestion: true } } },
      })
    : null;
  const maxMarks = placement?.section.marksPerQuestion ?? 1_000;

  const body = await req.json();
  const marksAwarded = Number(body.marksAwarded);
  const teacherFeedback = typeof body.teacherFeedback === 'string' ? body.teacherFeedback.trim() : '';
  if (!Number.isFinite(marksAwarded) || marksAwarded < 0 || marksAwarded > maxMarks) {
    return NextResponse.json({ error: `Marks must be between 0 and ${maxMarks}` }, { status: 400 });
  }
  if (!teacherFeedback || teacherFeedback.length > 5_000) {
    return NextResponse.json({ error: 'Feedback is required and must be under 5000 characters' }, { status: 400 });
  }

  const updated = await prisma.$transaction(async (tx) => {
    const response = await tx.testResponse.update({
      where: { id: responseId },
      data: {
        marksAwarded,
        teacherFeedback,
        reviewStatus: 'REVIEWED',
        reviewedAt: new Date(),
        reviewedById: teacherId,
      },
    });
    const aggregate = await tx.testResponse.aggregate({
      where: { attemptId: existing.attemptId },
      _sum: { marksAwarded: true },
    });
    await tx.testAttempt.update({
      where: { id: existing.attemptId },
      data: { totalScore: roundMarks(aggregate._sum.marksAwarded ?? 0) },
    });
    return response;
  });

  await recordAuditLog({
    actorId: teacherId,
    actorRole: 'TEACHER',
    action: 'HOMEWORK_RESPONSE_REVIEWED',
    entityType: 'TestResponse',
    entityId: responseId,
    metadata: { attemptId: existing.attemptId, marksAwarded },
    ...requestAuditContext(req),
  });

  return NextResponse.json({ success: true, response: updated });
}
