import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { requirePremiumTeacher } from '@/lib/teacher-api-guard';

export const dynamic = 'force-dynamic';

/**
 * Adds one question to a test a teacher is still putting together.
 *   { questionId, testId }      adds it to the end of that test's first section
 *   { questionId, newTitle }    starts a new test (one section, one mark each, no negative marking) with it
 * Only the teacher's own unpublished tests that nobody has attempted can be changed this way: a published test is
 * already in students' hands. Adding a question that is already in the test is refused.
 */
export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  const guard = await requirePremiumTeacher(session);
  if (!guard.ok) return guard.response;

  const body = await request.json().catch(() => null);
  const questionId = typeof body?.questionId === 'string' ? body.questionId : '';
  const testId = typeof body?.testId === 'string' && body.testId ? body.testId : null;
  const newTitle = typeof body?.newTitle === 'string' ? body.newTitle.trim().slice(0, 200) : '';
  if (!questionId || (!testId && !newTitle)) return NextResponse.json({ error: 'questionId and either testId or newTitle are required' }, { status: 400 });

  const question = await prisma.question.findFirst({
    where: { id: questionId, OR: [{ status: 'APPROVED', scope: 'PUBLIC' }, { createdById: guard.userId }] },
    select: { id: true, book: { select: { className: true } } },
  });
  if (!question) return NextResponse.json({ error: 'Question not found' }, { status: 404 });

  if (!testId) {
    const test = await prisma.test.create({
      data: {
        title: newTitle,
        class: question.book?.className ?? null,
        mode: 'STRICT',
        duration: 15,
        totalMarks: 1,
        isPublished: false,
        createdById: guard.userId,
        sections: { create: [{ title: 'Questions', marksPerQuestion: 1, negativeMarks: 0, questions: { create: [{ questionId, orderIndex: 0 }] } }] },
      },
      select: { id: true, title: true },
    });
    return NextResponse.json({ test, questionCount: 1, created: true }, { status: 201 });
  }

  const test = await prisma.test.findFirst({
    where: { id: testId, ...(guard.role === 'ADMIN' ? {} : { createdById: guard.userId }) },
    select: {
      id: true, title: true, isPublished: true, totalMarks: true,
      _count: { select: { attempts: true } },
      sections: { orderBy: { id: 'asc' }, select: { id: true, marksPerQuestion: true, questions: { select: { questionId: true, orderIndex: true } } } },
    },
  });
  if (!test) return NextResponse.json({ error: 'Test not found' }, { status: 404 });
  if (test.isPublished || test._count.attempts > 0) {
    return NextResponse.json({ error: 'That test is already published or has been attempted. Add the question to an unpublished test, or start a new one.' }, { status: 409 });
  }
  if (test.sections.some((s) => s.questions.some((q) => q.questionId === questionId))) {
    return NextResponse.json({ error: 'That question is already in this test.' }, { status: 409 });
  }

  const section = test.sections[0];
  if (!section) {
    await prisma.test.update({
      where: { id: test.id },
      data: { totalMarks: { increment: 1 }, sections: { create: [{ title: 'Questions', marksPerQuestion: 1, negativeMarks: 0, questions: { create: [{ questionId, orderIndex: 0 }] } }] } },
    });
  } else {
    const orderIndex = section.questions.reduce((max, q) => Math.max(max, q.orderIndex), -1) + 1;
    await prisma.$transaction([
      prisma.testQuestion.create({ data: { sectionId: section.id, questionId, orderIndex } }),
      prisma.test.update({ where: { id: test.id }, data: { totalMarks: { increment: section.marksPerQuestion } } }),
    ]);
  }
  const questionCount = test.sections.reduce((n, s) => n + s.questions.length, 0) + 1;
  return NextResponse.json({ test: { id: test.id, title: test.title }, questionCount, created: false });
}
