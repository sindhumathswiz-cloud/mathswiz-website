import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getAuthenticatedUser } from '@/lib/auth-server';
import { recordAuditLog, requestAuditContext } from '@/lib/audit-log';
import { renderPrivatePdfBatch } from '@/lib/pdf-page-renderer';
import type { PdfSourceProfile } from '@/lib/pdf-inventory';

export const runtime = 'nodejs';
export const maxDuration = 240;

export async function POST(request: Request, { params }: { params: Promise<{ id: string; runId: string }> }) {
  const auth = await getAuthenticatedUser(['ADMIN']);
  if ('error' in auth) return auth.error;
  const { id, runId } = await params;
  const body = await request.json().catch(() => ({}));
  const requestedStart = Number.isInteger(body.startPage) ? body.startPage : 1;
  const requestedBatchSize = Number.isInteger(body.batchSize) ? body.batchSize : 10;
  const batchSize = Math.min(20, Math.max(1, requestedBatchSize));
  const run = await prisma.bookIngestionRun.findFirst({
    where: { id: runId, bookId: id },
    select: { id: true, storagePath: true, sourceDocumentId: true, totalPages: true, providerConfig: true },
  });
  if (!run) return NextResponse.json({ error: 'Book ingestion run not found' }, { status: 404 });
  if (!run.storagePath || !run.sourceDocumentId || !run.totalPages) return NextResponse.json({ error: 'Run page inventory before rendering pages' }, { status: 409 });
  const start = Math.max(1, Math.min(requestedStart, run.totalPages));
  const end = Math.min(run.totalPages, start + batchSize - 1);

  await prisma.bookIngestionRun.update({ where: { id: run.id }, data: { status: 'IN_PROGRESS', stage: 'LAYOUT_ANALYSIS', errorMessage: null } });
  try {
    const config = run.providerConfig && typeof run.providerConfig === 'object' && !Array.isArray(run.providerConfig) ? run.providerConfig as { sourceProfile?: PdfSourceProfile } : {};
    const profile = config.sourceProfile || 'DIGITAL_MATH';
    const pages = await renderPrivatePdfBatch(run.storagePath, id, run.id, start, end, profile);
    await prisma.$transaction(pages.map(page => {
      const regionCounts = page.regions.reduce<Record<string, number>>((counts, region) => {
        const kind = String(region.kind || 'UNKNOWN');
        counts[kind] = (counts[kind] || 0) + 1;
        return counts;
      }, {});
      const layoutData = { detector: 'LOCAL_LAYOUT_V3', sourceProfile: profile, pageType: page.pageType, nativeCharacters: page.nativeCharacters, embeddedImages: page.embeddedImages, preprocessing: page.preprocessing, regionCounts, requiresVisionSegmentation: Boolean(regionCounts.VISION_SEGMENTATION_REQUIRED), regions: page.regions };
      return prisma.documentPage.upsert({
      where: { documentId_pageNumber: { documentId: run.sourceDocumentId!, pageNumber: page.pageNumber } },
      create: {
        documentId: run.sourceDocumentId!, pageNumber: page.pageNumber, rawMarkdown: '', rawText: '', nativeText: page.nativeText,
        hasImages: page.embeddedImages > 0, imageUrls: [], pageImagePath: page.imagePath, processedImagePath: page.processedImagePath, width: page.width, height: page.height,
        imageQualityScore: page.imageQualityScore, layoutData,
      },
      update: {
        nativeText: page.nativeText, hasImages: page.embeddedImages > 0, pageImagePath: page.imagePath, processedImagePath: page.processedImagePath, width: page.width, height: page.height,
        imageQualityScore: page.imageQualityScore, layoutData, errorMessage: null,
      },
    }); }));
    const renderedPages = await prisma.documentPage.count({ where: { documentId: run.sourceDocumentId, pageImagePath: { not: null } } });
    const complete = renderedPages >= run.totalPages;
    const progress = Math.min(25, 8 + (renderedPages / run.totalPages) * 17);
    await prisma.$transaction([
      prisma.sourceDocument.update({ where: { id: run.sourceDocumentId }, data: { processedPages: renderedPages } }),
      prisma.bookIngestionRun.update({ where: { id: run.id }, data: { processedPages: renderedPages, progress, stage: complete ? 'BOOK_MAPPING' : 'LAYOUT_ANALYSIS' } }),
    ]);
    await recordAuditLog({ actorId: auth.user.id, actorRole: 'ADMIN', action: 'BOOK_PAGE_BATCH_RENDERED', entityType: 'BookIngestionRun', entityId: run.id, metadata: { bookId: id, startPage: start, endPage: end, renderedPages, totalPages: run.totalPages }, ...requestAuditContext(request) });
    const batchQuestionRegions = pages.reduce((total, page) => total + page.regions.filter(region => region.kind === 'QUESTION_REGION_CANDIDATE').length, 0);
    const batchVisionPages = pages.filter(page => page.regions.some(region => region.kind === 'VISION_SEGMENTATION_REQUIRED')).length;
    return NextResponse.json({ batch: { startPage: start, endPage: end, count: pages.length, questionRegions: batchQuestionRegions, visionRequiredPages: batchVisionPages }, renderedPages, totalPages: run.totalPages, complete, nextStartPage: complete ? null : end + 1 });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Page rendering failed';
    await prisma.bookIngestionRun.update({ where: { id: run.id }, data: { status: 'PARTIAL', errorMessage: message.slice(0, 4000) } });
    console.error('Page rendering failed:', error);
    return NextResponse.json({ error: 'Page rendering failed; completed batches are preserved for retry.' }, { status: 500 });
  }
}
