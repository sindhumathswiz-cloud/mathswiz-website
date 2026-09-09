'use server';

import prisma from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { Role } from "@prisma/client";
import { hash } from "bcryptjs";

export async function updateUserDetailsAction(userId: string, data: {
    firstName?: string;
    lastName?: string;
    email?: string;
    mobileNumber?: string;
    phone?: string;
    class?: string;
    role?: string;
    password?: string;
}) {

    try {
        const updateData: any = { ...data };
        if (data.role) updateData.role = data.role as Role;
        if (data.password) updateData.password = await hash(data.password, 12);
        
        await prisma.user.update({
            where: { id: userId },
            data: updateData
        });
        revalidatePath(`/admin/users/${userId}`);
        revalidatePath('/admin/dashboard');
        return { success: true };
    } catch (error: any) {
        console.error("Failed to update user details:", error);
        return { error: error.message };
    }
}

export async function deleteUserAction(userId: string) {
    try {
        // Note: Prisma cascade delete should handle enrollments and attempts if configured,
        // but it's safer to check relations.
        await prisma.user.delete({
            where: { id: userId }
        });
        revalidatePath('/admin/dashboard');
        return { success: true };
    } catch (error: any) {
        console.error("Failed to delete user:", error);
        return { error: error.message };
    }
}

export async function toggleUserBlockAction(userId: string, isBlocked: boolean) {
    try {
        await prisma.user.update({
            where: { id: userId },
            data: { accountStatus: isBlocked ? 'BLOCKED' : 'APPROVED' }
        });
        revalidatePath(`/admin/users/${userId}`);
        revalidatePath('/admin/dashboard');
        return { success: true };
    } catch (error: any) {
        console.error("Failed to toggle user block:", error);
        return { error: error.message };
    }
}
export async function toggleEnrollmentStatusAction(enrollmentId: string, newStatus: string) {
    try {
        await (prisma as any).batchEnrollment.update({
            where: { id: enrollmentId },
            data: { status: newStatus }
        });
        revalidatePath('/admin/dashboard');
        return { success: true };
    } catch (error: any) {
        console.error("Failed to toggle enrollment status:", error);
        return { error: error.message };
    }
}
