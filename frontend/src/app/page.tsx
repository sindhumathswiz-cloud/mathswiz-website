import React from 'react';
import prisma from '@/lib/prisma';
import HomePageClient from '@/components/home/HomePageClient';

export default async function Home() {
  const homePage = await prisma.sitePage.findUnique({
    where: { slug: 'home' }
  });

  const baseDefaults = {
    hero: {
      isVisible: true,
      badge: "India's #1 Math Learning Platform",
      title: "Master Mathematics Without the Fear.",
      subtitle: "Join thousands of students cracking CBSE Boards, NDA, and CUET with our result-driven approach.",
      primaryButton: { text: "Start Learning Free", link: "/register" },
      heroImage: "https://images.unsplash.com/photo-1632516643720-e7f5d7d6eca8?q=80&w=800&auto=format&fit=crop"
    },
    testimonialsBlock: {
      isVisible: true,
      title: "Success Stories",
      testimonials: [
        { id: "t1", name: "Aarav Sharma", quote: "Sindhu ma'am's shortcut techniques for calculus saved me at least 15 minutes in the NDA math paper.", photoUrl: "/boy.png" },
        { id: "t2", name: "Priya Patel", quote: "I was struggling with 3D Geometry before joining. The visual resources completely changed my perspective.", photoUrl: "/girl.png" }
      ]
    }
  };

  // Keep the page CMS-editable, while retaining a complete public homepage
  // before the home record has been configured.
  const dbContent = homePage?.content as any || {};
  const resolvedContent = {
    ...baseDefaults,
    ...dbContent,
    hero: { ...baseDefaults.hero, ...(dbContent.hero || {}) },
  };
  const globalSettings = (homePage as any)?.globalSettings || {};

  return <HomePageClient content={resolvedContent} globalSettings={globalSettings} />;
}
