import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getAuthenticatedUser } from '@/lib/auth-server';
import { recordAuditLog, requestAuditContext } from '@/lib/audit-log';
import { renderPrivatePdfBatch } from '@/lib/pdf-page-renderer';
import type { PdfSourceProfile } from '@/lib/pdf-inventory';
import { countRegionKinds, hasUnlocatedGraphics, summarizeGeometry } from '@/lib/layout-regions';
import { parseTextLayer, textLayerUpdate } from '@/lib/page-text-layer';
import { startDraftClock } from '@/lib/draft-retention';
import { pageParity } from '@/lib/source-page-parity';

export const runtime = 'nodejs';
export const maxDuration = 240;

export async function POST(request: Request, { params }: { params: Promise<{ id: string; runId: string }> }) {
  const auth = await getAuthenticatedUser(['ADMIN']);
  if ('error' in auth) return auth.error;
  const { id, runId } = await params;
  const body = await request.json().catch(() => ({}));
  const explicitStart = Number.isInteger(body.startPage) && body.startPage >= 1 ? body.startPage : null;
  const requestedBatchSize = Number.isInteger(body.batchSize) ? body.batchSize : 10;
  const batchSize = Math.min(20, Math.max(1, requestedBatchSize));
  const run = await prisma.bookIngestionRun.findFirst({
    where: { id: runId, bookId: id },
    select: { id: true, storagePath: true, sourceDocumentId: true, totalPages: true, providerConfig: true },
  });
  if (!run) return NextResponse.json({ error: 'Book ingestion run not found' }, { status: 404 });
  if (!run.storagePath || !run.sourceDocumentId || !run.totalPages) return NextResponse.json({ error: 'Run page inventory before rendering pages' }, { status: 409 });
  // With no startPage, resume at the first page that has no image yet -- not at
  // "pages rendered + 1", which would step over a gap in the middle of the book
  // and leave the page count permanently short of the PDF's.
  let requestedStart = explicitStart ?? 1;
  if (explicitStart === null) {
    const held = new Set((await prisma.documentPage.findMany({ where: { documentId: run.sourceDocumentId, pageImagePath: { not: null } }, select: { pageNumber: true } })).map(page => page.pageNumber));
    while (requestedStart <= run.totalPages && held.has(requestedStart)) requestedStart++;
    if (requestedStart > run.totalPages) requestedStart = run.totalPages;
  }
  const start = Math.max(1, Math.min(requestedStart, run.totalPages));
  const end = Math.min(run.totalPages, start + batchSize - 1);

  await prisma.bookIngestionRun.update({ where: { id: run.id }, data: { status: 'IN_PROGRESS', stage: 'LAYOUT_ANALYSIS', errorMessage: null } });
  try {
    const config = run.providerConfig && typeof run.providerConfig === 'object' && !Array.isArray(run.providerConfig) ? run.providerConfig as { sourceProfile?: PdfSourceProfile } : {};
    const profile = config.sourceProfile || 'DIGITAL_MATH';
    const pages = await renderPrivatePdfBatch(run.storagePath, id, run.id, start, end, profile);
    const existingPages = await prisma.documentPage.findMany({ where: { documentId: run.sourceDocumentId, pageNumber: { gte: start, lte: end } }, select: { pageNumber: true, layoutData: true } });
    const existingLayouts = new Map(existingPages.map(item => [item.pageNumber, (item.layoutData && typeof item.layoutData === 'object' && !Array.isArray(item.layoutData) ? item.layoutData : {}) as { reconciliation?: unknown }]));
    await prisma.$transaction(pages.map(page => {
      const regionCounts = countRegionKinds(page.regions);
      // Scans have no embedded text, so no native layer; they get an OCR layer
      // during extraction. A re-render must never erase a layer already built.
      const nativeLayer = textLayerUpdate(parseTextLayer(page.textLayer));
      // Reconciliation (if already run) lives next to the layout; a re-render must not erase it.
      const previous = existingLayouts.get(page.pageNumber);
      const layoutData = { ...(previous?.reconciliation ? { reconciliation: previous.reconciliation } : {}), detector: 'LOCAL_LAYOUT_V4', geometry: page.geometry ?? null, hasUnlocatedGraphics: hasUnlocatedGraphics(regionCounts), sourceProfile: profile, pageType: page.pageType, nativeCharacters: page.nativeCharacters, embeddedImages: page.embeddedImages, preprocessing: page.preprocessing, regionCounts, requiresVisionSegmentation: Boolean(regionCounts.VISION_SEGMENTATION_REQUIRED), regions: page.regions };
      return prisma.documentPage.upsert({
      where: { documentId_pageNumber: { documentId: run.sourceDocumentId!, pageNumber: page.pageNumber } },
      create: {
        documentId: run.sourceDocumentId!, pageNumber: page.pageNumber, rawMarkdown: '', rawText: '', nativeText: page.nativeText,
        hasImages: page.embeddedImages > 0, imageUrls: [], pageImagePath: page.imagePath, processedImagePath: page.processedImagePath, width: page.width, height: page.height,
        imageQualityScore: page.imageQualityScore, layoutData, ...nativeLayer,
      },
      update: {
        nativeText: page.nativeText, hasImages: page.embeddedImages > 0, pageImagePath: page.imagePath, processedImagePath: page.processedImagePath, width: page.width, height: page.height,
        imageQualityScore: page.imageQualityScore, layoutData, ...nativeLayer, errorMessage: null,
      },
    }); }));
    const renderedPages = await prisma.documentPage.count({ where: { documentId: run.sourceDocumentId, pageImagePath: { not: null } } });
    const complete = renderedPages >= run.totalPages;
    // The extracted pages are a draft kept for DRAFT_RETENTION_DAYS from this render.
    await startDraftClock(run.id);
    // Only report parity once every page is in: mid-run it would just list the pages not rendered yet.
    const parity = complete ? await pageParity(run.sourceDocumentId, run.totalPages) : null;
    const progress = Math.min(25, 8 + (renderedPages / run.totalPages) * 17);
    await prisma.$transaction([
      prisma.sourceDocument.update({ where: { id: run.sourceDocumentId }, data: { processedPages: renderedPages } }),
      prisma.bookIngestionRun.update({ where: { id: run.id }, data: { processedPages: renderedPages, progress, stage: complete ? 'BOOK_MAPPING' : 'LAYOUT_ANALYSIS' } }),
    ]);
    await recordAuditLog({ actorId: auth.user.id, actorRole: 'ADMIN', action: 'BOOK_PAGE_BATCH_RENDERED', entityType: 'BookIngestionRun', entityId: run.id, metadata: { bookId: id, startPage: start, endPage: end, renderedPages, totalPages: run.totalPages }, ...requestAuditContext(request) });
    const batchQuestionRegions = pages.reduce((total, page) => total + page.regions.filter(region => region.kind === 'QUESTION_REGION_CANDIDATE').length, 0);
    const batchVisionPages = pages.filter(page => page.regions.some(region => region.kind === 'VISION_SEGMENTATION_REQUIRED')).length;
    const batchGeometry = summarizeGeometry(countRegionKinds(pages.flatMap(page => page.regions)));
    const geometryErrors = pages.filter(page => page.geometry?.error).map(page => ({ pageNumber: page.pageNumber, error: page.geometry!.error }));
    return NextResponse.json({ batch: { startPage: start, endPage: end, count: pages.length, questionRegions: batchQuestionRegions, visionRequiredPages: batchVisionPages, geometry: batchGeometry, geometryErrors }, renderedPages, totalPages: run.totalPages, complete, parity, nextStartPage: complete ? null : end + 1 });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Page rendering failed';
    await prisma.bookIngestionRun.update({ where: { id: run.id }, data: { status: 'PARTIAL', errorMessage: message.slice(0, 4000) } });
    console.error('Page rendering failed:', error);
    return NextResponse.json({ error: 'Page rendering failed; completed batches are preserved for retry.' }, { status: 500 });
  }
}
