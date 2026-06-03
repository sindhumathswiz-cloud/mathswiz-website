import { NextResponse } from 'next/server';
import prisma from "@/lib/prisma";
import { getServerSession } from 'next-auth';
import { authOptions } from "@/lib/auth";
import { revalidatePath } from 'next/cache';
import { awardPoints, POINTS_RULES } from '@/lib/gamification';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || (session.user as any).role !== 'STUDENT') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }
    const studentId = (session.user as any).id;

    const { questionId, selectedOption, timeSpent, isCorrect } = await req.json();

    // Log the practice event in TestAttempt
    const attempt = await prisma.testAttempt.create({
      data: {
        userId: studentId,
        testId: undefined, // Critical for Practice Arena
        isPracticeArena: true,
        status: 'SUBMITTED',
        startTime: new Date(Date.now() - timeSpent * 1000),
        endTime: new Date(),
        totalScore: isCorrect ? 1 : 0,
        totalCorrect: isCorrect ? 1 : 0,
        totalIncorrect: isCorrect ? 0 : 1,
        totalSkipped: 0,
        responses: {
          create: {
            questionId,
            selectedOption: String(selectedOption),
            isCorrect,
            marksAwarded: isCorrect ? 1 : 0,
            timeSpent,
            status: 'ANSWERED'
          }
        }
      }
    });

    // Update StudentProgress
    const question = await prisma.question.findUnique({ where: { id: questionId } });
    if (question?.topic) {
        await prisma.studentProgress.upsert({
            where: { id: `${studentId}_${question.topic}` }, // Assuming unique constraint exists or using find/update
            create: {
                userId: studentId,
                topic: question.topic,
                masteryScore: isCorrect ? 5 : 0,
                currentStreak: isCorrect ? 1 : 0,
            },
            update: {
                masteryScore: { increment: isCorrect ? 5 : -2 },
                currentStreak: isCorrect ? { increment: 1 } : { set: 0 },
                lastPracticedAt: new Date()
            }
        });
    }

    // Award points for practice
    await awardPoints(studentId, POINTS_RULES.PRACTICE_QUESTION, 'Practice question completed', { questionId, isCorrect });
    
    // Bonus points for correct answer
    if (isCorrect) {
      await awardPoints(studentId, 3, 'Correct answer', { questionId });
    }

    revalidatePath('/student', 'layout');
    return NextResponse.json({ success: true, attempt, pointsAwarded: isCorrect ? 5 : 2 });
  } catch (error: any) {
    console.error("Practice Save Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

