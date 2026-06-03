import prisma from "@/lib/prisma";

export async function seedSiteData() {
    const count = await prisma.sitePage.count();
    if (count > 0) return;

    const defaultGlobalSettings = {
        instituteName: "Sindhu's Mathswiz Classes",
        mainColor: "#4f46e5",
        logoUrl: "/logo.png",
        navTabs: [
            { id: "1", label: "Exams", link: "/exams" },
            { id: "2", label: "Learn", link: "/learn" },
            { id: "3", label: "Practice", link: "/practice" },
            { id: "4", label: "Test", link: "/test" },
            { id: "5", label: "Achieve", link: "/achieve" }
        ]
    };

    const defaultHomeContent = {
        hero: {
            title: "Master Mathematics Without the Fear.",
            subtitle: "Empowering students with AI-driven insights, flawless mathematics, and expert guidance. Join thousands cracking CBSE Boards, NDA, and CUET.",
            ctaText: "Start Learning Free",
            ctaLink: "/signup",
            imageUrl: "https://images.unsplash.com/photo-1632516643720-e7f5d7d6eca8?q=80&w=800&auto=format&fit=crop",
            showBadge: true,
            badgeText: "India's #1 Math Learning Platform"
        },
        stats: [
            { label: "Students", value: "10,000+" },
            { label: "Success Rate", value: "98%" },
            { label: "Study Hours", value: "50k+" }
        ],
        features: [
            { title: "Doubt Buddy AI", description: "Get answers to any math problem instantly with our intelligent companion.", icon: "Sparkles" },
            { title: "Adaptive Practice", description: "Questions that adapt to your skill level for maximum growth.", icon: "Target" },
            { title: "Expert Support", description: "Direct access to Sindhu Mam's world-class teaching methodology.", icon: "Users" }
        ],
        testimonials: [
            { id: "t1", name: "Rahul S.", role: "Class 12 Student", comment: "This changed my life! The mock tests are exactly like the real NDA exam.", avatar: "/boy.png" },
            { id: "t2", name: "Priya M.", role: "JEE Aspirant", comment: "I scored 98 in my CBSE boards thanks to Sindhu Ma'am's clear explanations.", avatar: "/girl.png" }
        ],
        faq: [
            { question: "How do I join a batch?", answer: "Go to your dashboard and enter the batch code provided by your teacher." },
            { question: "Is the Doubt Buddy available 24/7?", answer: "Yes! Our AI tutor is always online to help you with your math problems." }
        ],
        footer: {
            about: "Empowering students through AI-driven mathematics coaching.",
            contact: { address: "123 Education Lane", phone: "+91 98765 43210", email: "info@mathswiz.com" }
        }
    };

    await prisma.sitePage.create({
        data: { 
            slug: 'home', 
            title: 'Home', 
            content: defaultHomeContent, 
            globalSettings: defaultGlobalSettings,
            isPublished: true, 
            isVisible: true 
        }
    });

    await prisma.sitePage.createMany({
        data: [
            { slug: 'about-us', title: 'About Us', content: { hero: { title: 'About Mathswiz' } }, globalSettings: defaultGlobalSettings, isPublished: true, isVisible: true },
            { slug: 'courses', title: 'Courses', content: { hero: { title: 'Our Courses' } }, globalSettings: defaultGlobalSettings, isPublished: true, isVisible: true },
            { slug: 'contact', title: 'Contact', content: { hero: { title: 'Contact Us' } }, globalSettings: defaultGlobalSettings, isPublished: true, isVisible: true }
        ]
    });
}
