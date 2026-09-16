import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { hasReachedStage } from '@/lib/learning-path';

export const dynamic = 'force-dynamic';

const QUIZ_LENGTH = 10;
const MIN_QUIZ_QUESTIONS = 4;

export async function POST(_request: Request, { params }: { params: Promise<{ topic: string }> }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id || session.user.role !== 'STUDENT') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const studentId = session.user.id;
    const { topic: topicParam } = await params;
    const topic = decodeURIComponent(topicParam);

    const progress = await prisma.learningPathProgress.findUnique({
      where: { userId_topic: { userId: studentId, topic } },
    });
    if (!progress || !hasReachedStage(progress.stage, 'TIMED_QUIZ')) {
      return NextResponse.json({ error: 'This path has not reached the timed quiz yet' }, { status: 400 });
    }

    const pool = await prisma.question.findMany({
      where: { topic, status: 'APPROVED', scope: 'PUBLIC' },
      select: { id: true, content: true, options: true, difficulty: true },
      take: 50,
    });
    if (pool.length < MIN_QUIZ_QUESTIONS) {
      return NextResponse.json({ error: `Not enough questions in "${topic}" for a timed quiz yet (need at least ${MIN_QUIZ_QUESTIONS}).` }, { status: 422 });
    }

    const shuffled = [...pool].sort(() => Math.random() - 0.5);
    const questions = shuffled.slice(0, Math.min(QUIZ_LENGTH, pool.length));

    // No DB row for the quiz session itself (per plan: quiz attempts stay
    // isPracticeArena:true via the existing practice/submit route, client
    // enforces the timer). startedAt is echoed back so quiz/complete knows
    // which time window's MasteryEvent rows belong to this quiz.
    return NextResponse.json({
      questions,
      startedAt: new Date().toISOString(),
      suggestedSeconds: questions.length * 60,
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to start quiz' }, { status: 500 });
  }
}
