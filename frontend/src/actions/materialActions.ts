"use server";

import prisma from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { MaterialType } from "@prisma/client";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

export async function createMaterialAction(formData: FormData) {
    const title = formData.get("title") as string;
    const description = formData.get("description") as string;
    const type = formData.get("type") as MaterialType;
    const contentUrl = formData.get("contentUrl") as string;
    const grade = formData.get("class") as string;
    const subject = formData.get("subject") as string;
    const isFree = formData.get("isFree") === "true";
    const teacherId = formData.get("teacherId") as string;

    if (!title || !contentUrl || !teacherId) {
        throw new Error("Missing required fields: Title, Content URL, and Teacher ID are mandatory.");
    }
    
    // Auth & Scoping Check
    const session = await getServerSession(authOptions);
    const actualTeacherId = (session?.user as any)?.id;
    if (actualTeacherId !== teacherId) throw new Error("Unauthorized to create material for another teacher.");

    await (prisma as any).material.create({
        data: {
            title,
            description,
            type,
            contentUrl,
            class: grade,
            subject,
            isFree,
            createdById: teacherId
        }
    });

    revalidatePath('/teacher/dashboard');
    revalidatePath('/student/dashboard');
}

export async function updateMaterialAction(formData: FormData) {
    const id = formData.get("id") as string;
    const title = formData.get("title") as string;
    const description = formData.get("description") as string;
    const type = formData.get("type") as MaterialType;
    const contentUrl = formData.get("contentUrl") as string;
    const grade = formData.get("class") as string;
    const subject = formData.get("subject") as string;
    const isFree = formData.get("isFree") === "true";

    if (!id || !title || !contentUrl) {
        throw new Error("Missing required fields for update.");
    }

    // Auth & Scoping Check
    const session = await getServerSession(authOptions);
    const teacherId = (session?.user as any)?.id;
    if (!teacherId) throw new Error("Unauthorized");

    const material = await (prisma as any).material.findUnique({
        where: { id }
    });

    if (!material) throw new Error("Material not found.");
    if (material.createdById !== teacherId) throw new Error("Unauthorized to edit this material.");

    await (prisma as any).material.update({
        where: { id },
        data: {
            title,
            description,
            type,
            contentUrl,
            class: grade,
            subject,
            isFree
        }
    });

    revalidatePath('/teacher/dashboard');
    revalidatePath('/student/dashboard');
}

export async function deleteMaterialAction(id: string) {
    if (!id) throw new Error("Material ID is required.");
    
    // Auth & Scoping Check
    const session = await getServerSession(authOptions);
    const teacherId = (session?.user as any)?.id;
    if (!teacherId) throw new Error("Unauthorized");

    const material = await (prisma as any).material.findUnique({
        where: { id }
    });

    if (!material) throw new Error("Material not found.");
    if (material.createdById !== teacherId) throw new Error("Unauthorized to delete this material.");

    await (prisma as any).material.delete({ where: { id } });
    revalidatePath('/teacher/dashboard');
    revalidatePath('/student/dashboard');
}
