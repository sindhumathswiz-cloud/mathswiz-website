import { NextResponse } from 'next/server';
import prisma from "@/lib/prisma";
import { getServerSession } from 'next-auth';
import { authOptions } from "@/lib/auth";
import { extractClaimedAnswerIndex, parseQuestionOptions, resolveCorrectOptionIndex } from '@/lib/arena-answer';
import { masteryBand } from '@/lib/mastery-view';

export const dynamic = 'force-dynamic';

// Preferred difficulty per mastery band. A student who is struggling on a
// topic mostly sees EASY/MEDIUM questions; a student who has it well in hand
// mostly sees MEDIUM/HARD. Every band still allows some spread rather than a
// hard cutoff, since a purely deterministic difficulty ladder would make the
// Arena feel mechanical rather than adaptive.
const PREFERRED_DIFFICULTY: Record<string, string[]> = {
  needs_support: ['EASY', 'MEDIUM'],
  developing: ['EASY', 'MEDIUM', 'HARD'],
  secure: ['MEDIUM', 'HARD'],
};

export async function GET(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id || session.user.role !== 'STUDENT') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const studentId = session.user.id;

    const { searchParams } = new URL(req.url);
    const topic = searchParams.get('topic');
    const difficulty = searchParams.get('difficulty');

    const where: any = { status: 'APPROVED', correctAnswer: { not: '' } };
    if (topic) where.topic = topic;
    if (difficulty) where.difficulty = difficulty;

    // Stored options have existed as JSON arrays, JSON strings, and occasionally
    // malformed legacy values. Validate before selection so an unusable
    // record never reaches the interactive Arena.
    const candidates = await prisma.question.findMany({
      where,
      take: 250,
      orderBy: { updatedAt: 'desc' },
      include: { createdBy: { select: { firstName: true, lastName: true } } },
    });

    const usable = candidates.flatMap(candidate => {
      const options = parseQuestionOptions(candidate.options);
      const correctIndex = resolveCorrectOptionIndex(candidate.correctAnswer, options);
      const claimedIndex = extractClaimedAnswerIndex(candidate.explanation);
      const explanationAgrees = claimedIndex === null || claimedIndex === correctIndex;
      return options.length >= 2 && correctIndex >= 0 && explanationAgrees
        ? [{ ...candidate, options }]
        : [];
    });
    if (usable.length === 0) {
      return NextResponse.json({ error: 'No valid multiple-choice questions found' }, { status: 404 });
    }

    const question = await pickAdaptiveQuestion(usable, studentId, {
      topicPinned: !!topic,
      difficultyPinned: !!difficulty,
    });

    return NextResponse.json({ question });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

/**
 * Weighted-random pick that biases toward the student's own weaker topics and
 * an appropriate difficulty for their mastery band, without ever reducing any
 * candidate's chance to zero — a topic the student has already mastered can
 * still recur (for retention), and a new student with no mastery history yet
 * is treated as "developing" rather than excluded from weighting entirely.
 * An explicit topic/difficulty filter from the caller disables that part of
 * the weighting, since the student asked for something specific.
 */
async function pickAdaptiveQuestion(
  usable: any[],
  studentId: string,
  opts: { topicPinned: boolean; difficultyPinned: boolean },
) {
  let masteryByTopic = new Map<string, number>();
  try {
    const progress = await prisma.studentProgress.findMany({
      where: { userId: studentId },
      select: { topic: true, masteryScore: true },
    });
    masteryByTopic = new Map(progress.map((p) => [p.topic, p.masteryScore]));
  } catch {
    // Mastery lookup is a scoring hint, not a correctness requirement — fall
    // back to unweighted random selection rather than fail the whole request.
  }

  const weighted = usable.map((q) => {
    let weight = 1;
    const score = q.topic ? masteryByTopic.get(q.topic) : undefined;
    const band = score === undefined ? 'developing' : masteryBand(score);

    if (!opts.topicPinned && score !== undefined) {
      weight *= band === 'needs_support' ? 4 : band === 'developing' ? 2 : 1;
    }
    if (!opts.difficultyPinned) {
      const preferred = PREFERRED_DIFFICULTY[band] || PREFERRED_DIFFICULTY.developing;
      if (preferred.includes(q.difficulty)) weight *= 2;
    }
    return { q, weight };
  });

  const totalWeight = weighted.reduce((sum, w) => sum + w.weight, 0);
  let roll = Math.random() * totalWeight;
  for (const { q, weight } of weighted) {
    roll -= weight;
    if (roll <= 0) return q;
  }
  return weighted[weighted.length - 1].q;
}

