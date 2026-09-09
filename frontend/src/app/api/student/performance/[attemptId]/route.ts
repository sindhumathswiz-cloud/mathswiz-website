import { NextResponse } from 'next/server';
import prisma from "@/lib/prisma";
import { getServerSession } from 'next-auth';
import { authOptions } from "@/lib/auth";

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

    return NextResponse.json({ attempt, behavioral: stats, rank, totalTakers });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
