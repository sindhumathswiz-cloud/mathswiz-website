"use server";

import prisma from "@/lib/prisma";
import { revalidatePath } from "next/cache";

export async function updateSitePageAction(id: string, content: any, globalSettings: any) {
    try {
        const page = await prisma.sitePage.update({
            where: { id },
            data: {
                content: content,
                globalSettings: globalSettings,
                isPublished: true
            }
        });
        revalidatePath("/");
        revalidatePath("/admin/manage-website");
        return { success: true, page };
    } catch (error) {
        console.error("Update Page Error:", error);
        return { success: false, error: "Failed to update page" };
    }
}

export async function createSitePageAction(data: { title: string; slug: string; content: any }) {
    try {
        const page = await prisma.sitePage.create({
            data: {
                title: data.title,
                slug: data.slug,
                content: data.content,
                isPublished: false,
                isVisible: true
            }
        });
        revalidatePath("/admin/manage-website");
        return { success: true, page };
    } catch (error) {
        console.error("Create Page Error:", error);
        return { success: false, error: "Failed to create page" };
    }
}

export async function deleteSitePageAction(id: string) {
    try {
        await prisma.sitePage.delete({ where: { id } });
        revalidatePath("/admin/manage-website");
        return { success: true };
    } catch (error) {
        console.error("Delete Page Error:", error);
        return { success: false, error: "Failed to delete page" };
    }
}

export async function seedSitePagesAction() {
    const pages = await prisma.sitePage.count();
    if (pages > 0) return { success: true, message: "Already seeded" };

    const defaultSchema = {
        hero: { 
            isVisible: true, 
            badge: "India's #1 Math Learning Platform", 
            title: "Master Mathematics Without the Fear.", 
            subtitle: "Empowering students with AI-driven insights, flawless mathematics, and expert guidance. Join thousands cracking CBSE Boards, NDA, and CUET.", 
            primaryButton: { text: "Start Learning Free", link: "/signup" }, 
            heroImage: "https://images.unsplash.com/photo-1632516643720-e7f5d7d6eca8?q=80&w=800&auto=format&fit=crop",
            style: { backgroundColor: "#ffffff", titleColor: "#111827", titleFontSize: "48px", titleFontFamily: "Inter" } 
        },
        testimonialsBlock: {
            isVisible: true,
            title: "Success Stories",
            testimonials: [
                { id: "t1", name: "Rahul S.", quote: "This changed my life! The mock tests are exactly like the real NDA exam.", photoUrl: "/boy.png" },
                { id: "t2", name: "Priya M.", quote: "I scored 98 in my CBSE boards thanks to Sindhu Ma'am's clear explanations.", photoUrl: "/girl.png" }
            ],
            style: { backgroundColor: "#ffffff", titleColor: "#111827", cardBgColor: "#f3f4f6" }
        },
        footer: {
            isVisible: true,
            aboutText: "Empowering students to conquer math through structured learning and AI.",
            contact: { address: "123 Education Lane", phone: "+91 98765 43210", email: "info@mathswiz.com" },
            socialLinks: { facebook: "", instagram: "", youtube: "" }
        }
    };

    const globalSchema = {
        instituteName: "Sindhu's Mathswiz",
        instituteSubtext: "PLATFORM",
        logoUrl: "/logo.png",
        style: { headerBgColor: "#ffffff", headerTextColor: "#111827" }
    };

    const slugs = ['home', 'about-us', 'courses', 'contact', 'login', 'signup'];
    
    await Promise.all(slugs.map(slug => 
        prisma.sitePage.create({
            data: {
                slug,
                title: slug.charAt(0).toUpperCase() + slug.slice(1).replace('-', ' '),
                content: defaultSchema,
                globalSettings: (globalSchema as any),
                isPublished: true,
                isVisible: true
            }
        })
    ));

    revalidatePath("/admin/manage-website");
    return { success: true };
}
