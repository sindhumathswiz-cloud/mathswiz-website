import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getAuthenticatedUser } from '@/lib/auth-server';
import { summarizeGeometry } from '@/lib/layout-regions';

export async function GET(_request: Request, { params }: { params: Promise<{ id: string; runId: string }> }) {
  const auth = await getAuthenticatedUser(['ADMIN']);
  if ('error' in auth) return auth.error;
  const { id, runId } = await params;
  const run = await prisma.bookIngestionRun.findFirst({ where: { id: runId, bookId: id }, select: { sourceDocumentId: true, totalPages: true } });
  if (!run?.sourceDocumentId) return NextResponse.json({ error: 'Book ingestion run not found' }, { status: 404 });
  const pages = await prisma.documentPage.findMany({ where: { documentId: run.sourceDocumentId, pageImagePath: { not: null } }, select: { pageNumber: true, processedImagePath: true, layoutData: true } });
  const pageTypes: Record<string, number> = {};
  const regionTypes: Record<string, number> = {};
  const visionRequiredPages: number[] = [];
  const unlocatedGraphicsPages: number[] = [];
  const geometryErrorPages: number[] = [];
  for (const page of pages) {
    const layout = page.layoutData && typeof page.layoutData === 'object' && !Array.isArray(page.layoutData) ? page.layoutData as { pageType?: string; regionCounts?: Record<string, number>; requiresVisionSegmentation?: boolean; hasUnlocatedGraphics?: boolean; geometry?: { error?: string | null } | null } : {};
    const pageType = layout.pageType || 'UNKNOWN';
    pageTypes[pageType] = (pageTypes[pageType] || 0) + 1;
    for (const [kind, count] of Object.entries(layout.regionCounts || {})) regionTypes[kind] = (regionTypes[kind] || 0) + Number(count || 0);
    if (layout.requiresVisionSegmentation) visionRequiredPages.push(page.pageNumber);
    if (layout.hasUnlocatedGraphics) unlocatedGraphicsPages.push(page.pageNumber);
    if (layout.geometry?.error) geometryErrorPages.push(page.pageNumber);
  }
  return NextResponse.json({ summary: { totalPages: run.totalPages, renderedPages: pages.length, enhancedPages: pages.filter(page => page.processedImagePath).length, pageTypes, regionTypes, questionRegionCandidates: regionTypes.QUESTION_REGION_CANDIDATE || 0, geometry: summarizeGeometry(regionTypes), unlocatedGraphicsPages, geometryErrorPages, visionRequiredCount: visionRequiredPages.length, visionRequiredPages } });
}
