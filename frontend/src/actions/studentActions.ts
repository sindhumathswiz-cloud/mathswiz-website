"use server";
import prisma from "@/lib/prisma";
import { revalidatePath } from "next/cache";

import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

export async function joinBatchAction(formData: FormData) {
    const session = await getServerSession(authOptions);
    const studentId = (session?.user as any)?.id;

    if (!studentId) throw new Error("Authentication error: Missing student ID. Please log in again.");

    const code = formData.get("batchCode") as string;
    if (!code) throw new Error("Batch code is required.");

    // Clean whitespace
    const cleanCode = code.trim();

    // 1. Verify Batch Exists (CASE-INSENSITIVE SEARCH)
    const batch = await (prisma as any).batch.findFirst({ 
        where: { 
            code: { equals: cleanCode, mode: 'insensitive' } 
        } 
    });
    if (!batch) throw new Error("Invalid Batch Code. Please check for typos.");

    // 2. Prevent Duplicates
    const existing = await (prisma as any).batchEnrollment.findFirst({
        where: { batchId: batch.id, studentId }
    });
    if (existing) throw new Error("You have already requested to join this batch.");
    if (existing) throw new Error("You have already requested to join this batch.");

    // 4. Create the Enrollment with STRICT "PENDING" Status
    await (prisma as any).batchEnrollment.create({
        data: {
            batchId: batch.id,
            studentId: studentId,
            status: "PENDING" // CRITICAL: MUST MATCH THE TEACHER DASHBOARD QUERY EXACTLY
        }
    });

    // 5. NUCLEAR CACHE DESTRUCTION: Refresh BOTH dashboards instantly
    revalidatePath('/student', 'layout');
    revalidatePath('/student/dashboard');
    revalidatePath('/teacher/dashboard');
}
