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

    const student = await prisma.user.findFirst({
        where: { email: studentEmail, role: 'STUDENT' }
    });

    if (!student) {
        throw new Error("Student with this email not found. Please ensure the email is correct and the student has an account.");
    }

    const existingLink = await prisma.parentLink.findFirst({
        where: { studentId: student.id, parentId: session.user.id }
    });
    if (existingLink) {
        throw new Error("This student is already linked to your account.");
    }

    await prisma.parentLink.create({
        data: { parentId: session.user.id, studentId: student.id }
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
    
    const result = await prisma.parentLink.deleteMany({
        where: { studentId, parentId: session.user.id }
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
