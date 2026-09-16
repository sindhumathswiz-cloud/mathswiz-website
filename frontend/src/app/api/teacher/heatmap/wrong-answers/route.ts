import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';

export const dynamic = 'force-dynamic';

const MAX_QUESTIONS = 30;

// Common-wrong-answer breakdown: for each question the batch got wrong,
// how the wrong selectedOption letters are distributed. TestResponse
// already carries selectedOption/isCorrect; Question carries correctAnswer
// -- no new schema needed, just the aggregation.
export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id || session.user.role !== 'TEACHER') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const batchId = searchParams.get('batchId');
  const topic = searchParams.get('topic');
  if (!batchId) return NextResponse.json({ error: 'batchId is required' }, { status: 400 });

  const enrollments = await prisma.batchEnrollment.findMany({
    where: { status: 'APPROVED', batchId, batch: { teacherId: session.user.id } },
    select: { studentId: true },
  });
  if (enrollments.length === 0) return NextResponse.json({ questions: [] });
  const studentIds = [...new Set(enrollments.map((e) => e.studentId))];

  const attempts = await prisma.testAttempt.findMany({
    where: { userId: { in: studentIds } },
    select: { id: true },
  });
  if (attempts.length === 0) return NextResponse.json({ questions: [] });
  const attemptIds = attempts.map((a) => a.id);

  const grouped = await prisma.testResponse.groupBy({
    by: ['questionId', 'selectedOption'],
    where: { attemptId: { in: attemptIds }, isCorrect: false, selectedOption: { not: null } },
    _count: { _all: true },
  });
  if (grouped.length === 0) return NextResponse.json({ questions: [] });

  const questionIds = [...new Set(grouped.map((g) => g.questionId))];
  const questions = await prisma.question.findMany({
    where: { id: { in: questionIds }, ...(topic ? { topic } : {}) },
    select: { id: true, content: true, topic: true, correctAnswer: true },
  });
  const questionById = new Map(questions.map((q) => [q.id, q]));

  const byQuestion = new Map<string, { option: string; count: number }[]>();
  for (const g of grouped) {
    if (!questionById.has(g.questionId)) continue; // filtered out by topic
    const list = byQuestion.get(g.questionId) ?? [];
    list.push({ option: g.selectedOption as string, count: g._count._all });
    byQuestion.set(g.questionId, list);
  }

  const result = Array.from(byQuestion.entries())
    .map(([questionId, wrongOptionBreakdown]) => {
      const question = questionById.get(questionId)!;
      const totalWrong = wrongOptionBreakdown.reduce((sum, o) => sum + o.count, 0);
      return {
        questionId,
        content: question.content,
        topic: question.topic,
        correctAnswer: question.correctAnswer,
        wrongOptionBreakdown: wrongOptionBreakdown.sort((a, b) => b.count - a.count),
        totalWrong,
      };
    })
    .sort((a, b) => b.totalWrong - a.totalWrong)
    .slice(0, MAX_QUESTIONS);

  return NextResponse.json({ questions: result });
}
