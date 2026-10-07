import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { isPremiumSubscription } from '@/lib/subscription';
import { markableTestsFor } from '@/lib/written-review';

export const dynamic = 'force-dynamic';

export async function GET() {
  const session = await getServerSession(authOptions);
  const teacherId = session?.user?.id;
  if (!teacherId || session.user.role !== 'TEACHER') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const caller = await prisma.user.findUnique({ where: { id: teacherId }, select: { subscription: true } });
  if (!isPremiumSubscription(caller?.subscription)) {
    return NextResponse.json({ error: 'This feature requires a premium subscription.' }, { status: 403 });
  }

  const responses = await prisma.testResponse.findMany({
    where: {
      reviewStatus: { in: ['PENDING', 'REVIEWED'] },
      attempt: {
        status: { in: ['SUBMITTED', 'AUTO_SUBMITTED'] },
        test: markableTestsFor(teacherId),
      },
    },
    select: {
      id: true,
      subjectiveText: true,
      subjectiveImage: true,
      marksAwarded: true,
      reviewStatus: true,
      teacherFeedback: true,
      reviewedAt: true,
      question: { select: { id: true, content: true, explanation: true } },
      attempt: {
        select: {
          id: true,
          testId: true,
          endTime: true,
          user: { select: { id: true, firstName: true, lastName: true } },
          test: { select: { id: true, title: true, totalMarks: true } },
        },
      },
    },
    orderBy: [{ reviewStatus: 'asc' }, { attempt: { endTime: 'desc' } }],
    take: 200,
  });

  // The most a question can be marked out of is its section's marks per question.
  const questionIds = [...new Set(responses.map((r) => r.question.id))];
  const testIds = [...new Set(responses.map((r) => r.attempt.testId).filter((id): id is string => !!id))];
  const placements = questionIds.length === 0 ? [] : await prisma.testQuestion.findMany({
    where: { questionId: { in: questionIds }, section: { testId: { in: testIds } } },
    select: { questionId: true, section: { select: { testId: true, marksPerQuestion: true } } },
  });
  const maxByKey = new Map(placements.map((p) => [`${p.section.testId}:${p.questionId}`, p.section.marksPerQuestion]));
  const submissions = responses.map((r) => ({ ...r, maxMarks: maxByKey.get(`${r.attempt.testId}:${r.question.id}`) ?? null }));

  return NextResponse.json({ submissions });
}
