import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getAuthenticatedUser } from '@/lib/auth-server';
import { removePrivateImage } from '@/lib/book-storage';
import { cropPageRegion } from '@/lib/page-image-crop';
import { ocrPageWithMathpix } from '@/lib/extract-book-page';

export const runtime = 'nodejs';
export const maxDuration = 60;

/**
 * The PDF snip-and-paste tool's write half: crop an admin-drawn rectangle
 * out of a book page's rendered image and OCR just that crop, so the admin
 * can recover a region the extraction pipeline got wrong (garbled symbols,
 * a figure-adjacent formula, etc.) and paste the correct text straight into
 * the field they're editing -- see PageSnipTool.tsx.
 *
 * A single best-effort admin action, not a batch pipeline stage -- no audit
 * log (matching the read-only .../pages/route.ts inspector, which has
 * none either), and the crop file is a throwaway OCR input, never linked to
 * a QuestionImage/PageFigure row, deleted once OCR finishes either way.
 *
 * Body: { x, y, width, height } -- pixel coordinates in the NATURAL size of
 * the image GET .../pages/[pageNumber]/image streams (i.e. what
 * img.naturalWidth/naturalHeight report client-side, not the displayed size).
 */

const MIN_DIMENSION = 10;
const MAX_DIMENSION = 4000;

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string; pageNumber: string }> },
) {
  const auth = await getAuthenticatedUser(['ADMIN']);
  if ('error' in auth) return auth.error;
  const { id, pageNumber: pageNumberParam } = await params;

  const pageNumber = Number.parseInt(pageNumberParam, 10);
  if (!Number.isInteger(pageNumber) || pageNumber < 1) {
    return NextResponse.json({ error: 'Invalid page number' }, { status: 400 });
  }

  const body = await request.json().catch(() => null);
  const x = Number(body?.x);
  const y = Number(body?.y);
  const width = Number(body?.width);
  const height = Number(body?.height);
  if (![x, y, width, height].every(Number.isFinite) || x < 0 || y < 0) {
    return NextResponse.json({ error: 'A region ({ x, y, width, height }) is required' }, { status: 400 });
  }
  if (width < MIN_DIMENSION || height < MIN_DIMENSION || width > MAX_DIMENSION || height > MAX_DIMENSION) {
    return NextResponse.json({ error: `Selection must be between ${MIN_DIMENSION} and ${MAX_DIMENSION} pixels in each dimension` }, { status: 400 });
  }

  const book = await prisma.book.findUnique({
    where: { id },
    select: { ingestionRuns: { orderBy: { createdAt: 'desc' }, take: 1, select: { id: true, sourceDocumentId: true } } },
  });
  const run = book?.ingestionRuns[0];
  if (!run?.sourceDocumentId) return NextResponse.json({ error: 'Book ingestion run not found' }, { status: 404 });

  const page = await prisma.documentPage.findFirst({
    where: { documentId: run.sourceDocumentId, pageNumber },
    select: { processedImagePath: true, pageImagePath: true },
  });
  const sourceImagePath = page?.processedImagePath || page?.pageImagePath;
  if (!sourceImagePath) return NextResponse.json({ error: 'Page image not found' }, { status: 404 });

  const fileName = `snip-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.jpg`;
  let croppedPath: string | null = null;
  try {
    const crop = await cropPageRegion(id, run.id, sourceImagePath, fileName, { x, y, width, height });
    croppedPath = crop.imagePath;
    const ocr = await ocrPageWithMathpix(croppedPath);
    return NextResponse.json({ text: ocr.text });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Snip failed' }, { status: 500 });
  } finally {
    if (croppedPath) await removePrivateImage(croppedPath).catch(() => undefined);
  }
}
