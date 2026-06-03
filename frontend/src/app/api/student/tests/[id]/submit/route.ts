import { NextResponse } from 'next/server';
import prisma from "@/lib/prisma";
import { getServerSession } from 'next-auth';
import { authOptions } from "@/lib/auth";
import { revalidatePath } from 'next/cache';
import { awardPoints, POINTS_RULES } from '@/lib/gamification';

export const dynamic = 'force-dynamic';

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const session = await getServerSession(authOptions);
    if (!session || (session.user as any).role !== 'STUDENT') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }
    const studentId = (session.user as any).id;

    const { attemptId, responses } = await req.json();

    const attempt = await prisma.testAttempt.findFirst({
      where: { id: attemptId, userId: studentId }
    });

    if (!attempt) return NextResponse.json({ error: 'Attempt not found' }, { status: 404 });
    if (attempt.status === 'SUBMITTED') return NextResponse.json({ error: 'Already submitted' }, { status: 400 });

    const test = await prisma.test.findUnique({
      where: { id },
      include: { sections: { include: { questions: { include: { question: true } } } } }
    });

    if (!test) return NextResponse.json({ error: 'Test not found' }, { status: 404 });

    let totalScore = 0;
    let totalCorrect = 0;
    let totalIncorrect = 0;
    let totalSkipped = 0;

    const responseRecords = [];

    for (const section of test.sections) {
      for (const tq of section.questions) {
        const q = tq.question;
        const studentResponse = responses[q.id];

        let isCorrect = false;
        let status = 'SKIPPED';
        let marksAwarded = 0;
        let selectedOption = null;

        if (studentResponse && studentResponse.selectedOption !== null && studentResponse.selectedOption !== undefined) {
          status = 'ANSWERED';
          selectedOption = String(studentResponse.selectedOption);

          if (q.type === 'SINGLE_CHOICE' || q.type === 'MULTIPLE_CHOICE' || q.type === 'INTEGER' || q.type === 'TRUE_FALSE') {
            if (q.correctAnswer === selectedOption) {
              isCorrect = true;
              marksAwarded = section.marksPerQuestion;
              totalCorrect++;
            } else {
              isCorrect = false;
              marksAwarded = -section.negativeMarks; // subtract negative marks
              totalIncorrect++;
            }
          }
        } else {
          totalSkipped++;
        }

        totalScore += marksAwarded;

        responseRecords.push({
          attemptId,
          questionId: q.id,
          selectedOption,
          isCorrect,
          marksAwarded,
          status,
          timeSpent: studentResponse?.timeSpent || 0
        });
      }
    }

    const updatedAttempt = await prisma.testAttempt.update({
      where: { id: attemptId },
      data: {
        status: 'SUBMITTED',
        endTime: new Date(),
        totalScore,
        totalCorrect,
        totalIncorrect,
        totalSkipped
      }
    });

    await prisma.testResponse.createMany({
      data: responseRecords
    });

    // Award points for test completion
    await awardPoints(studentId, POINTS_RULES.TEST_COMPLETED, 'Test completed', { testId: id, score: totalScore });

    // Bonus points for perfect score
    if (totalCorrect > 0 && totalIncorrect === 0 && totalSkipped === 0) {
      await awardPoints(studentId, POINTS_RULES.TEST_PERFECT_SCORE, 'Perfect score', { testId: id });
    }

    // Nuclear Revalidation: Refresh all student pages
    revalidatePath('/student', 'layout');

    return NextResponse.json({ ...updatedAttempt, pointsAwarded: POINTS_RULES.TEST_COMPLETED });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
