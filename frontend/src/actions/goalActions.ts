"use server";
import prisma from "@/lib/prisma";
import { revalidatePath } from "next/cache";

export async function setStudentGoalAction(formData: FormData) {
    const userId = formData.get("userId") as string;
    const targetExam = formData.get("targetExam") as string;
    const targetScore = parseFloat(formData.get("targetScore") as string);

    if (!userId || !targetExam || isNaN(targetScore)) {
        throw new Error("All fields are required to set your goal.");
    }

    await (prisma as any).studentGoal.upsert({
        where: { userId },
        update: { targetExam, targetScore },
        create: { userId, targetExam, targetScore }
    });

    revalidatePath('/student', 'layout');
}
