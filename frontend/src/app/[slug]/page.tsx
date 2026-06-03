import React from 'react';
import prisma from '@/lib/prisma';
import HomePageClient from '@/components/home/HomePageClient';
import { notFound } from 'next/navigation';

export default async function DynamicSitePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;

  // Root handled by app/page.tsx, but just in case
  if (slug === 'home') return notFound();

  const page = await prisma.sitePage.findUnique({
    where: { slug }
  });

  if (!page || !page.isVisible) {
    return notFound();
  }

  // Currently we use HomePageClient for all pages as it's a flexible block renderer
  // If we want different layouts for different pages, we can branch here.
  return <HomePageClient content={page.content as any} />;
}

export async function generateStaticParams() {
  const pages = await prisma.sitePage.findMany({
    select: { slug: true }
  });

  return pages.map((page: any) => ({
    slug: page.slug,
  }));
}
