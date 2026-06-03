'use server';

import prisma from "@/lib/prisma";
import { revalidatePath } from "next/cache";

export async function updateSitePageAction(id: string, data: any, globalSettings?: any) {
    try {
        const updateData: any = {
            content: data,
            updatedAt: new Date(),
        };

        if (globalSettings) {
            updateData.globalSettings = globalSettings;
        }

        const updatedPage = await prisma.sitePage.update({
            where: { id },
            data: updateData,
        });

        // Revalidate the dynamic route and the home page
        revalidatePath("/");
        revalidatePath(`/${updatedPage.slug}`);
        
        return { success: true, page: updatedPage };
    } catch (error: any) {
        console.error("Failed to update site page:", error);
        return { success: false, error: error.message };
    }
}

export async function createSitePageAction(data: { title: string; slug: string; content: any }) {
    try {
        const newPage = await prisma.sitePage.create({
            data: {
                title: data.title,
                slug: data.slug,
                content: data.content,
                isVisible: true,
            },
        });

        revalidatePath(`/${newPage.slug}`);
        return { success: true, page: newPage };
    } catch (error: any) {
        console.error("Failed to create site page:", error);
        return { success: false, error: error.message };
    }
}

export async function deleteSitePageAction(id: string) {
    try {
        const deletedPage = await prisma.sitePage.delete({
            where: { id },
        });

        revalidatePath(`/${deletedPage.slug}`);
        return { success: true };
    } catch (error: any) {
        console.error("Failed to delete site page:", error);
        return { success: false, error: error.message };
    }
}
