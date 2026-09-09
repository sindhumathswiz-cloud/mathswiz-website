import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { extractClaimedAnswerIndex, parseQuestionOptions, resolveCorrectOptionIndex } from '@/lib/arena-answer';
import { computeMistakeQueue, isDueForReview } from '@/lib/mistake-queue';

export const dynamic = 'force-dynamic';

const MAX_QUESTIONS = 20;

export async function GET(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id || session.user.role !== 'STUDENT') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const studentId = session.user.id;

    const { searchParams } = new URL(req.url);
    // scope=due (default): only questions whose spaced-review interval has
    // elapsed — for a passive nudge/badge. scope=all: every question the
    // student hasn't corrected yet, regardless of schedule — for when they
    // explicitly asked to review their mistakes right now.
    const scope = searchParams.get('scope') === 'all' ? 'all' : 'due';

    const events = await prisma.masteryEvent.findMany({
      where: { userId: studentId, questionId: { not: null } },
      select: { questionId: true, isCorrect: true, createdAt: true },
    });

    const now = new Date();
    const allMistakes = computeMistakeQueue(events, now);
    const relevant = scope === 'all' ? allMistakes : allMistakes.filter((e) => isDueForReview(e, now));

    if (relevant.length === 0) {
      return NextResponse.json({ questions: [], dueCount: allMistakes.filter((e) => isDueForReview(e, now)).length });
    }

    const picked = relevant.slice(0, MAX_QUESTIONS);
    const questionIds = picked.map((e) => e.questionId);

    // Same eligibility as /practice/next and /practice/submit: APPROVED for
    // the general bank, or PENDING_REVIEW for a still-unreviewed
    // AI-generated question this same student answered.
    const questions = await prisma.question.findMany({
      where: { id: { in: questionIds }, status: { in: ['APPROVED', 'PENDING_REVIEW'] }, scope: 'PUBLIC' },
      include: { createdBy: { select: { firstName: true, lastName: true } } },
    });
    const byId = new Map(questions.map((q) => [q.id, q]));

    const usable = picked.flatMap((entry) => {
      const candidate = byId.get(entry.questionId);
      if (!candidate) return [];
      const options = parseQuestionOptions(candidate.options);
      const correctIndex = resolveCorrectOptionIndex(candidate.correctAnswer, options);
      const claimedIndex = extractClaimedAnswerIndex(candidate.explanation);
      const explanationAgrees = claimedIndex === null || claimedIndex === correctIndex;
      return options.length >= 2 && correctIndex >= 0 && explanationAgrees
        ? [{ ...candidate, options, missCount: entry.missCount, lastMissedAt: entry.lastMissedAt }]
        : [];
    });

    return NextResponse.json({
      questions: usable,
      dueCount: allMistakes.filter((e) => isDueForReview(e, now)).length,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
