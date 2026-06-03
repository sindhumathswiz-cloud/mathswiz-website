import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";

export async function POST() {
    try {
        const count = await prisma.sitePage.count();
        if (count > 0) return NextResponse.json({ message: "Pages already exist" });

        const homePage = await prisma.sitePage.create({
            data: {
                slug: "home",
                title: "Home",
                content: {
                    hero: {
                        title: "Master Mathematics.",
                        subtitle: "Empowering students through AI-driven coaching.",
                        ctaText: "Start Learning Free",
                        ctaLink: "/signup",
                        imageUrl: "https://images.unsplash.com/photo-1632516643720-e7f5d7d6eca8?q=80&w=800&auto=format&fit=crop",
                        style: {
                            backgroundColor: "#ffffff",
                            titleColor: "#111827",
                            subtitleColor: "#4b5563",
                            titleFontSize: "64px",
                        }
                    },
                    stats: {
                        items: [
                            { label: "Students", value: "10,000+" },
                            { label: "Success Rate", value: "98%" },
                            { label: "Study Hours", value: "50k+" }
                        ],
                        style: {
                            backgroundColor: "#f9fafb",
                            textColor: "#111827",
                            valueColor: "#4f46e5"
                        }
                    },
                    features: {
                        title: "Why Choose Mathswiz?",
                        items: [
                            { title: "Personalized Doubt Buddy", description: "Get answers to any math problem instantly.", icon: "Sparkles" },
                            { title: "Adaptive Practice", description: "Questions that adapt to your skill level.", icon: "Target" },
                            { title: "Expert Support", description: "Direct access to Sindhu Mam's guidance.", icon: "Users" }
                        ],
                        style: {
                            backgroundColor: "#ffffff",
                            cardBg: "#ffffff",
                            titleColor: "#111827",
                            descriptionColor: "#6b7280"
                        }
                    },
                    testimonials: {
                        items: [
                            { id: "1", name: "Aryan", role: "Class 12 Student", comment: "Best platform for JEE preparation!", avatar: "/boy.png" }
                        ],
                        style: {
                            backgroundColor: "#f3f4f6"
                        }
                    },
                    faq: {
                        items: [
                            { question: "How do I join a batch?", answer: "Go to your dashboard and enter the batch code." }
                        ],
                        style: {
                            backgroundColor: "#ffffff"
                        }
                    },
                    footer: {
                        about: "Empowering students through AI-driven mathematics coaching.",
                        contact: { address: "123 Education Lane", phone: "+91 98765 43210", email: "info@mathswiz.com" },
                        style: {
                            backgroundColor: "#111827",
                            textColor: "#ffffff"
                        }
                    }
                },
                globalSettings: {
                    instituteName: "Sindhu's Mathswiz",
                    mainColor: "#4f46e5",
                    logoUrl: "/logo.png",
                    navTabs: [
                        { id: "1", label: "Exams", link: "/exams" },
                        { id: "2", label: "Courses", link: "/courses" }
                    ]
                },
                isPublished: true,
                isVisible: true
            } as any
        });

        return NextResponse.json({ success: true, page: homePage });
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

