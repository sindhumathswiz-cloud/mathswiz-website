"use server";

import prisma from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { recordAuditLog } from "@/lib/audit-log";

export async function linkStudentAction(parentId: string, studentEmail: string) {
    if (!parentId || !studentEmail) {
        throw new Error("Parent ID and Student Email are required.");
    }

    const session = await getServerSession(authOptions);
    if (!session?.user?.id || session.user.role !== "PARENT" || session.user.id !== parentId) {
        throw new Error("Unauthorized");
    }

    const student = await (prisma as any).user.findFirst({
        where: { email: studentEmail, role: 'STUDENT' }
    });

    if (!student) {
        throw new Error("Student with this email not found. Please ensure the email is correct and the student has an account.");
    }

    if (student.parentId) {
        throw new Error("This student is already linked to a parent account.");
    }

    await (prisma as any).user.update({
        where: { id: student.id },
        data: { parentId: session.user.id }
    });

    await recordAuditLog({
        actorId: session.user.id,
        actorRole: session.user.role,
        action: "PARENT_STUDENT_LINKED",
        entityType: "User",
        entityId: student.id,
    });

    revalidatePath('/parent/dashboard');
}

export async function unlinkStudentAction(studentId: string) {
    if (!studentId) throw new Error("Student ID is required.");
    const session = await getServerSession(authOptions);
    if (!session?.user?.id || session.user.role !== "PARENT") throw new Error("Unauthorized");
    
    const result = await (prisma as any).user.updateMany({
        where: { id: studentId, parentId: session.user.id },
        data: { parentId: null }
    });

    if (result.count === 0) throw new Error("Student is not linked to your account.");

    await recordAuditLog({
        actorId: session.user.id,
        actorRole: session.user.role,
        action: "PARENT_STUDENT_UNLINKED",
        entityType: "User",
        entityId: studentId,
    });

    revalidatePath('/parent/dashboard');
}
