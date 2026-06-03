'use server';

import prisma from "@/lib/prisma";
import { revalidatePath } from "next/cache";

interface PracticeSessionResult {
    userId: string;
    totalCorrect: number;
    totalIncorrect: number;
    totalSkipped: number;
    totalScore: number;
    durationSeconds: number;
}

/**
 * Saves a completed Practice Arena session to the database as a TestAttempt.
 * isPracticeArena = true, testId = null — so it feeds into global performance analytics.
 */
export async function savePracticeSessionAction(data: PracticeSessionResult) {
    const { userId, totalCorrect, totalIncorrect, totalSkipped, totalScore, durationSeconds } = data;

    if (!userId) throw new Error("User not authenticated.");

    const startTime = new Date(Date.now() - durationSeconds * 1000);

    await prisma.testAttempt.create({
        data: {
            userId,
            testId: null,
            isPracticeArena: true,
            status: 'SUBMITTED',
            startTime,
            endTime: new Date(),
            totalScore,
            totalCorrect,
            totalIncorrect,
            totalSkipped,
        }
    });

    revalidatePath('/student/performance');
    revalidatePath('/student/achieve');
    revalidatePath('/student/dashboard');
}
