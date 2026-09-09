"use server";
import prisma from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { recordAuditLog } from "@/lib/audit-log";

export async function assignTestToBatchAction(formData: FormData) {
    const testId = formData.get("testId") as string;
    const batchId = formData.get("batchId") as string;
    const scheduledFor = formData.get("scheduledFor") as string;
    const deadline = formData.get("deadline") as string;
    const maxAttempts = parseInt(formData.get("maxAttempts") as string) || 1;
    const kind = formData.get("kind") === "HOMEWORK" ? "HOMEWORK" : "TEST";
    const instructions = String(formData.get("instructions") || "").trim().slice(0, 2000);

    if (!testId || !batchId) throw new Error("Test ID and Batch ID are required.");

    // Auth & Scoping Check
    const session = await getServerSession(authOptions);
    const teacherId = session?.user?.id;
    const role = session?.user?.role;
    if (!teacherId || role !== "TEACHER") throw new Error("Unauthorized");

    const scheduledDate = scheduledFor ? new Date(scheduledFor) : null;
    const deadlineDate = deadline ? new Date(deadline) : null;
    if (scheduledDate && Number.isNaN(scheduledDate.getTime())) throw new Error("Invalid scheduled time.");
    if (deadlineDate && Number.isNaN(deadlineDate.getTime())) throw new Error("Invalid deadline.");
    if (scheduledDate && deadlineDate && deadlineDate <= scheduledDate) throw new Error("Deadline must be after the scheduled time.");

    // Verify the batch belongs to this teacher
    const batch = await (prisma as any).batch.findFirst({
        where: { id: batchId, teacherId }
    });
    if (!batch) throw new Error("Batch not found or unauthorized.");

    // Verify the test exists and is authorized (either created by them or public/approved)
    const test = await (prisma as any).test.findUnique({
        where: { id: testId }
    });
    if (!test) throw new Error("Test not found.");
    if (test.createdById !== teacherId || !test.isPublished) {
        throw new Error("Unauthorized to assign this test.");
    }

    const assignment = await (prisma as any).testAssignment.create({
        data: {
            testId,
            batchId,
            scheduledFor: scheduledDate,
            deadline: deadlineDate,
            maxAttempts: Math.max(1, Math.min(maxAttempts, 10)),
            kind,
            instructions: instructions || null,
        }
    });

    await recordAuditLog({
        actorId: teacherId,
        actorRole: role,
        action: kind === "HOMEWORK" ? "HOMEWORK_ASSIGNED" : "TEST_ASSIGNED",
        entityType: "TestAssignment",
        entityId: assignment.id,
        metadata: { testId, batchId, scheduledFor: scheduledDate, deadline: deadlineDate, maxAttempts },
    });

    revalidatePath(`/teacher/batch-management/${batchId}`);
}

export async function savePracticeAttemptAction(data: {
    userId: string;
    totalScore: number;
    totalCorrect: number;
    totalIncorrect: number;
    totalSkipped: number;
}) {
    if (!data.userId) throw new Error("User ID is required.");

    await (prisma as any).testAttempt.create({
        data: {
            userId: data.userId,
            testId: null, // Practice arena sessions have no specific test linked
            isPracticeArena: true,
            status: "SUBMITTED",
            totalScore: data.totalScore,
            totalCorrect: data.totalCorrect,
            totalIncorrect: data.totalIncorrect,
            totalSkipped: data.totalSkipped,
            endTime: new Date()
        }
    });

    revalidatePath('/student/dashboard');
}
