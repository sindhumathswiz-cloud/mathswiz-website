import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { requirePremiumTeacher } from '@/lib/teacher-api-guard';

export const dynamic = 'force-dynamic';

const MAX_QUESTIONS = 200;

const num = (value: unknown, fallback: number, min: number, max: number) =>
  typeof value === 'number' && Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback;

/**
 * Puts the questions picked in the question browser into a question paper or a practice sheet, in the order given.
 *   { questionIds, testId }                      adds them to the end of that test's first section
 *   { questionIds, newTitle, kind, ... }         starts one: kind 'paper' (a test) or 'sheet' (a reusable worksheet),
 *                                                with optional className, duration (minutes), marksPerQuestion, negativeMarks
 * Only approved questions (or the caller's own) can be added. Only the caller's own unpublished, unattempted tests
 * change (any, for an admin). Questions already in the test are skipped and counted, not refused.
 */
export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  const guard = await requirePremiumTeacher(session);
  if (!guard.ok) return guard.response;

  const body = await request.json().catch(() => null);
  const requested: string[] = Array.isArray(body?.questionIds)
    ? [...new Set<string>(body.questionIds.filter((id: unknown): id is string => typeof id === 'string' && id.length > 0))]
    : [];
  const testId = typeof body?.testId === 'string' && body.testId ? body.testId : null;
  const newTitle = typeof body?.newTitle === 'string' ? body.newTitle.trim().slice(0, 200) : '';
  if (!requested.length || (!testId && !newTitle)) {
    return NextResponse.json({ error: 'questionIds and either testId or newTitle are required' }, { status: 400 });
  }
  if (requested.length > MAX_QUESTIONS) {
    return NextResponse.json({ error: `Add at most ${MAX_QUESTIONS} questions at a time.` }, { status: 400 });
  }

  const usable = await prisma.question.findMany({
    where: { id: { in: requested }, status: { not: 'ARCHIVED' }, OR: [{ status: 'APPROVED', scope: 'PUBLIC' }, { createdById: guard.userId }] },
    select: { id: true, book: { select: { className: true } }, class: true },
  });
  const usableIds = new Set(usable.map((q) => q.id));
  const ordered = requested.filter((id) => usableIds.has(id));
  const refused = requested.length - ordered.length;
  if (!ordered.length) {
    return NextResponse.json({ error: 'None of these questions can be used: only approved questions, or your own, can go into a paper.' }, { status: 404 });
  }

  if (!testId) {
    const kind = body?.kind === 'sheet' ? 'sheet' : 'paper';
    const marks = num(body?.marksPerQuestion, 1, 0, 100);
    const negative = num(body?.negativeMarks, 0, 0, 100);
    const duration = Math.round(num(body?.duration, kind === 'sheet' ? 30 : 60, 1, 600));
    // The class is the caller's choice, else the one most of the questions are from.
    const tally = new Map<string, number>();
    for (const q of usable) {
      const c = q.book?.className ?? q.class;
      if (c) tally.set(c, (tally.get(c) ?? 0) + 1);
    }
    const common = [...tally].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
    const className = typeof body?.className === 'string' && body.className.trim() ? body.className.trim().slice(0, 40) : common;
    const test = await prisma.test.create({
      data: {
        title: newTitle,
        class: className,
        mode: 'STRICT',
        duration,
        totalMarks: marks * ordered.length,
        isPublished: false,
        templateType: kind === 'sheet' ? 'WORKSHEET' : null,
        createdById: guard.userId,
        sections: {
          create: [{
            title: kind === 'sheet' ? 'Practice' : 'Questions',
            marksPerQuestion: marks,
            negativeMarks: negative,
            questions: { create: ordered.map((questionId, orderIndex) => ({ questionId, orderIndex })) },
          }],
        },
      },
      select: { id: true, title: true },
    });
    return NextResponse.json({ test, created: true, added: ordered.length, alreadyIn: 0, refused, questionCount: ordered.length }, { status: 201 });
  }

  const test = await prisma.test.findFirst({
    where: { id: testId, ...(guard.role === 'ADMIN' ? {} : { createdById: guard.userId }) },
    select: {
      id: true, title: true, isPublished: true,
      _count: { select: { attempts: true } },
      sections: { orderBy: { id: 'asc' }, select: { id: true, marksPerQuestion: true, questions: { select: { questionId: true, orderIndex: true } } } },
    },
  });
  if (!test) return NextResponse.json({ error: 'Test not found' }, { status: 404 });
  if (test.isPublished || test._count.attempts > 0) {
    return NextResponse.json({ error: 'That paper is already published or has been attempted. Choose an unpublished one, or start a new one.' }, { status: 409 });
  }

  const present = new Set(test.sections.flatMap((s) => s.questions.map((q) => q.questionId)));
  const toAdd = ordered.filter((id) => !present.has(id));
  const alreadyIn = ordered.length - toAdd.length;
  const existingCount = present.size;
  if (toAdd.length) {
    const section = test.sections[0];
    if (!section) {
      await prisma.test.update({
        where: { id: test.id },
        data: {
          totalMarks: { increment: toAdd.length },
          sections: { create: [{ title: 'Questions', marksPerQuestion: 1, negativeMarks: 0, questions: { create: toAdd.map((questionId, orderIndex) => ({ questionId, orderIndex })) } }] },
        },
      });
    } else {
      const start = section.questions.reduce((max, q) => Math.max(max, q.orderIndex), -1) + 1;
      await prisma.$transaction([
        prisma.testQuestion.createMany({ data: toAdd.map((questionId, i) => ({ sectionId: section.id, questionId, orderIndex: start + i })) }),
        prisma.test.update({ where: { id: test.id }, data: { totalMarks: { increment: section.marksPerQuestion * toAdd.length } } }),
      ]);
    }
  }
  return NextResponse.json({
    test: { id: test.id, title: test.title }, created: false, added: toAdd.length, alreadyIn, refused,
    questionCount: existingCount + toAdd.length,
  });
}
