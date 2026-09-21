import { NextResponse } from 'next/server';
import prisma from "@/lib/prisma";
import { getServerSession } from 'next-auth';
import { authOptions } from "@/lib/auth";
import { classifyErrorType, deriveConfidence, COMMON_MISTAKE_MIN_COUNT } from '@/lib/response-insight';
import { computeMistakeQueue, isDueForReview } from '@/lib/mistake-queue';

export const dynamic = 'force-dynamic';

export async function GET(req: Request, { params }: { params: Promise<{ attemptId: string }> }) {
  try {
    const { attemptId } = await params;
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const attempt = await prisma.testAttempt.findFirst({
      where: { id: attemptId, userId: session.user.id },
      include: {
        test: {
          include: {
            sections: {
                include: {
                    questions: {
                        include: {
                            question: true
                        }
                    }
                }
            }
          }
        },
        responses: {
          include: {
            question: true
          }
        }
      }
    });

    if (!attempt) return NextResponse.json({ error: 'Attempt not found' }, { status: 404 });

    // Calculate Behavioral Analytics
    const answeredResponses = attempt.responses.filter((r: any) => r.timeSpent > 0);
    const times = answeredResponses.map((r: any) => r.timeSpent).sort((a: number, b: number) => a - b);
    const medianTime = times.length > 0 ? times[Math.floor(times.length / 2)] : 60;

    const stats = {
      perfect: 0,   // Correct + Reasonable Time
      wasted: 0,    // Incorrect + High Time
      overtime: 0,  // Correct + High Time
      tooFast: 0,   // Low Time (Guessing)
      skipped: attempt.totalSkipped,
      correct: attempt.totalCorrect,
      incorrect: attempt.totalIncorrect,
      totalScore: attempt.totalScore,
      medianTime
    };

    attempt.responses.forEach((r: any) => {
      if (r.status === 'SKIPPED') return;
      
      const isOvertime = r.timeSpent > medianTime * 1.5;
      const isTooFast = r.timeSpent < medianTime * 0.5;

      if (r.isCorrect) {
        if (isOvertime) stats.overtime++;
        else if (isTooFast) stats.tooFast++; // potentially a lucky guess
        else stats.perfect++;
      } else {
        if (isOvertime) stats.wasted++;
        else if (isTooFast) stats.tooFast++; // failed guess
      }
    });

    let rank: number | null = null;
    let totalTakers = 0;
    if (attempt.testId) {
      const cohortWhere = {
        testId: attempt.testId,
        status: { in: ['COMPLETED', 'SUBMITTED', 'AUTO_SUBMITTED'] },
      };
      const [higherScores, takers] = await Promise.all([
        prisma.testAttempt.count({ where: { ...cohortWhere, totalScore: { gt: attempt.totalScore } } }),
        prisma.testAttempt.count({ where: cohortWhere }),
      ]);
      rank = higherScores + 1;
      totalTakers = takers;
    }

    // Per-response error type + confidence (Roadmap Phase 3 -- deterministic
    // heuristics from lib/response-insight.ts, not an LLM classification).
    // "Common mistake" needs to know, for each wrong pick in this attempt,
    // how many students (across all attempts) picked that same wrong
    // option -- one groupBy for the whole attempt rather than one query per
    // response.
    const wrongQuestionIds = [...new Set(
      attempt.responses.filter((r: any) => r.isCorrect === false && r.selectedOption != null).map((r: any) => r.questionId)
    )];
    const commonMistakeGroups = wrongQuestionIds.length > 0 ? await prisma.testResponse.groupBy({
      by: ['questionId', 'selectedOption'],
      where: { questionId: { in: wrongQuestionIds }, isCorrect: false, selectedOption: { not: null } },
      _count: { _all: true },
    }) : [];
    const commonMistakeCount = new Map<string, number>();
    for (const g of commonMistakeGroups) {
      if (g.selectedOption == null) continue;
      commonMistakeCount.set(`${g.questionId}:${g.selectedOption}`, g._count._all);
    }

    const responseInsights = attempt.responses.map((r: any) => {
      const isSkipped = r.status === 'SKIPPED';
      const isCommonMistake = !isSkipped && !r.isCorrect && r.selectedOption != null &&
        (commonMistakeCount.get(`${r.questionId}:${r.selectedOption}`) ?? 0) >= COMMON_MISTAKE_MIN_COUNT;
      return {
        responseId: r.id,
        questionId: r.questionId,
        errorType: classifyErrorType({
          isCorrect: r.isCorrect,
          isSkipped,
          timeSpent: r.timeSpent,
          medianTime,
          isCommonMistake,
        }),
        confidence: isSkipped ? null : deriveConfidence({
          wasMarkedForReview: r.status === 'MARKED_FOR_REVIEW',
          timeSpent: r.timeSpent,
          medianTime,
        }),
      };
    });

    // Recommended next action: due mistakes first (there's already a
    // dedicated review flow for those), otherwise nudge toward the weakest
    // topic this attempt actually touched, otherwise nothing to flag.
    const masteryEvents = await prisma.masteryEvent.findMany({
      where: { userId: session.user.id },
      select: { questionId: true, isCorrect: true, createdAt: true },
    });
    const dueMistakes = computeMistakeQueue(masteryEvents).filter((e) => isDueForReview(e));

    let recommendedAction: { type: 'REVIEW_MISTAKES'; count: number } | { type: 'PRACTICE_WEAK_TOPIC'; topic: string } | { type: 'KEEP_GOING' };
    if (dueMistakes.length > 0) {
      recommendedAction = { type: 'REVIEW_MISTAKES', count: dueMistakes.length };
    } else {
      const attemptTopics = [...new Set(attempt.responses.map((r: any) => r.question?.topic).filter(Boolean))] as string[];
      const weakest = attemptTopics.length > 0 ? await prisma.studentProgress.findFirst({
        where: { userId: session.user.id, topic: { in: attemptTopics } },
        orderBy: { masteryScore: 'asc' },
        select: { topic: true },
      }) : null;
      recommendedAction = weakest ? { type: 'PRACTICE_WEAK_TOPIC', topic: weakest.topic } : { type: 'KEEP_GOING' };
    }

    return NextResponse.json({ attempt, behavioral: stats, rank, totalTakers, responseInsights, recommendedAction });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
