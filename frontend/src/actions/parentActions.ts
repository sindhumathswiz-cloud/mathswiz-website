"use server";

import prisma from "@/lib/prisma";
import { revalidatePath } from "next/cache";

export async function linkStudentAction(parentId: string, studentEmail: string) {
    if (!parentId || !studentEmail) {
        throw new Error("Parent ID and Student Email are required.");
    }

    const student = await (prisma as any).user.findUnique({
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
        data: { parentId }
    });

    revalidatePath('/parent/dashboard');
}

export async function unlinkStudentAction(studentId: string) {
    if (!studentId) throw new Error("Student ID is required.");
    
    await (prisma as any).user.update({
        where: { id: studentId },
        data: { parentId: null }
    });

    revalidatePath('/parent/dashboard');
}
