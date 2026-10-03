import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getAuthenticatedUser } from '@/lib/auth-server';
import { recordAuditLog, requestAuditContext } from '@/lib/audit-log';
import { ocrPageWithMathpix } from '@/lib/extract-book-page';
import { buildNativeTextLayers } from '@/lib/pdf-text-layer';
import { GARBLED_NATIVE_THRESHOLD, nativeLayerIsUsable, textLayerUpdate } from '@/lib/page-text-layer';

export const runtime = 'nodejs';
export const maxDuration = 240;

/**
 * Builds the selectable text layer for pages that do not have one yet.
 *
 *  - Pages with usable embedded text get a NATIVE layer straight from the PDF:
 *    free and local, always run.
 *  - Scanned pages (or pages whose embedded text is mostly unmapped glyphs)
 *    need a Mathpix OCR layer. That spends provider credits, so it only runs
 *    when the request sets `allowOcr: true` -- an explicit admin action, never
 *    a side effect. Without it those pages are counted and left alone.
 *
 * GET reports the counts so the UI can show what each option will cost.
 */

const MIN_NATIVE_CHARS = 40;
const NATIVE_BATCH = 20;
const OCR_BATCH = 4;

interface Candidate {
  id: string;
  pageNumber: number;
  missing: boolean;
  nativeChars: number;
  pageImagePath: string | null;
  processedImagePath: string | null;
  width: number | null;
  height: number | null;
}

async function loadRun(id: string, runId: string) {
  return prisma.bookIngestionRun.findFirst({
    where: { id: runId, bookId: id },
    select: { id: true, storagePath: true, sourceDocumentId: true, totalPages: true, draftPurgedAt: true },
  });
}

export async function GET(_request: Request, { params }: { params: Promise<{ id: string; runId: string }> }) {
  const auth = await getAuthenticatedUser(['ADMIN']);
  if ('error' in auth) return auth.error;
  const { id, runId } = await params;
  const run = await loadRun(id, runId);
  if (!run?.sourceDocumentId) return NextResponse.json({ error: 'Book ingestion run not found' }, { status: 404 });
  if (run.draftPurgedAt) return NextResponse.json({ error: 'This draft expired and its pages were deleted' }, { status: 410 });

  const [counts] = await prisma.$queryRaw<Array<{ total: bigint; withLayer: bigint; freeToBuild: bigint; needOcr: bigint; garbledNative: bigint }>>`
    SELECT COUNT(*) AS "total",
           COUNT(*) FILTER (WHERE "textLayer" IS NOT NULL) AS "withLayer",
           COUNT(*) FILTER (WHERE "textLayer" IS NULL AND COALESCE(length("nativeText"), 0) >= ${MIN_NATIVE_CHARS}) AS "freeToBuild",
           COUNT(*) FILTER (WHERE "pageImagePath" IS NOT NULL AND (
             ("textLayer" IS NULL AND COALESCE(length("nativeText"), 0) < ${MIN_NATIVE_CHARS})
             OR ("textLayer"->>'source' = 'NATIVE_PDF' AND COALESCE(("textLayer"->>'garbled')::float, 0) >= ${GARBLED_NATIVE_THRESHOLD}))) AS "needOcr",
           COUNT(*) FILTER (WHERE "textLayer"->>'source' = 'NATIVE_PDF' AND COALESCE(("textLayer"->>'garbled')::float, 0) >= ${GARBLED_NATIVE_THRESHOLD}) AS "garbledNative"
    FROM "DocumentPage" WHERE "documentId" = ${run.sourceDocumentId}`;
  return NextResponse.json({
    totalPages: Number(counts.total),
    withTextLayer: Number(counts.withLayer),
    // Free: built from the PDF's embedded text.
    freeToBuild: Number(counts.freeToBuild),
    // Spends Mathpix credits (roughly one request per page).
    needOcr: Number(counts.needOcr),
    garbledNative: Number(counts.garbledNative),
  });
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string; runId: string }> }) {
  const auth = await getAuthenticatedUser(['ADMIN']);
  if ('error' in auth) return auth.error;
  const { id, runId } = await params;
  const body = await request.json().catch(() => ({}));
  const allowOcr = body.allowOcr === true;
  const startPage = Number.isInteger(body.startPage) && body.startPage > 0 ? body.startPage : 1;
  const ceiling = allowOcr ? OCR_BATCH : NATIVE_BATCH;
  const batchSize = Math.min(ceiling, Math.max(1, Number.isInteger(body.batchSize) ? body.batchSize : ceiling));

  const run = await loadRun(id, runId);
  if (!run?.sourceDocumentId || !run.storagePath) return NextResponse.json({ error: 'Book ingestion run not found' }, { status: 404 });
  if (run.draftPurgedAt) return NextResponse.json({ error: 'This draft expired and its pages were deleted' }, { status: 410 });

  const candidates = await prisma.$queryRaw<Candidate[]>`
    SELECT "id", "pageNumber", ("textLayer" IS NULL) AS "missing", COALESCE(length("nativeText"), 0)::int AS "nativeChars",
           "pageImagePath", "processedImagePath", "width", "height"
    FROM "DocumentPage"
    WHERE "documentId" = ${run.sourceDocumentId} AND "pageNumber" >= ${startPage}
      AND ("textLayer" IS NULL OR ("textLayer"->>'source' = 'NATIVE_PDF' AND COALESCE(("textLayer"->>'garbled')::float, 0) >= ${GARBLED_NATIVE_THRESHOLD}))
    ORDER BY "pageNumber" LIMIT ${batchSize}`;

  let nativeBuilt = 0;
  let ocrBuilt = 0;
  const needsOcr: Candidate[] = [];
  const failures: Array<{ pageNumber: number; error: string }> = [];

  try {
    const wantNative = candidates.filter(page => page.missing && page.nativeChars >= MIN_NATIVE_CHARS);
    const layers = await buildNativeTextLayers(run.storagePath, wantNative.map(page => page.pageNumber));
    for (const page of wantNative) {
      const layer = layers.get(page.pageNumber) ?? null;
      if (layer) {
        await prisma.documentPage.update({ where: { id: page.id }, data: textLayerUpdate(layer) });
        nativeBuilt++;
      }
      // A garbled layer is still stored (its readable words stay selectable),
      // but mostly-unmapped text is also an OCR candidate.
      if (!nativeLayerIsUsable(layer)) needsOcr.push(page);
    }
    needsOcr.push(...candidates.filter(page => !wantNative.includes(page)));
  } catch (error) {
    return NextResponse.json({ error: `Could not read the PDF's embedded text: ${error instanceof Error ? error.message : 'unknown error'}` }, { status: 500 });
  }

  let ocrSkipped = needsOcr.length;
  if (allowOcr) {
    ocrSkipped = 0;
    for (const page of needsOcr) {
      const imagePath = page.processedImagePath || page.pageImagePath;
      if (!imagePath) { failures.push({ pageNumber: page.pageNumber, error: 'No rendered page image' }); continue; }
      try {
        const ocr = await ocrPageWithMathpix(imagePath, { width: page.width, height: page.height });
        if (!ocr.textLayer) { failures.push({ pageNumber: page.pageNumber, error: 'OCR returned no positioned text' }); continue; }
        await prisma.documentPage.update({ where: { id: page.id }, data: textLayerUpdate(ocr.textLayer) });
        ocrBuilt++;
      } catch (error) {
        failures.push({ pageNumber: page.pageNumber, error: error instanceof Error ? error.message.slice(0, 300) : 'OCR failed' });
      }
    }
  }

  await recordAuditLog({
    actorId: auth.user.id, actorRole: 'ADMIN', action: 'BOOK_PAGE_TEXT_LAYERS_BUILT', entityType: 'BookIngestionRun', entityId: run.id,
    metadata: { bookId: id, pages: candidates.map(page => page.pageNumber), nativeBuilt, ocrBuilt, ocrAllowed: allowOcr, ocrSkipped, failures },
    ...requestAuditContext(request),
  });

  const last = candidates[candidates.length - 1]?.pageNumber;
  return NextResponse.json({
    batch: { pages: candidates.map(page => page.pageNumber), nativeBuilt, ocrBuilt, ocrSkipped, failures },
    nextStartPage: candidates.length === batchSize && last ? last + 1 : null,
  });
}
