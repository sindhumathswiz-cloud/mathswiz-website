import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getAuthenticatedUser } from '@/lib/auth-server';
import { comparePages } from '@/lib/source-page-parity';
import { daysUntilExpiry } from '@/lib/draft-retention';
import { GARBLED_NATIVE_THRESHOLD } from '@/lib/page-text-layer';

export const runtime = 'nodejs';

/**
 * Overview for the page-faithful source viewer: which book/draft this is, how
 * long the draft is kept, whether its pages match the PDF's page count, and a
 * light row per page (size + which text layer it has) so the viewer can lay
 * out every page at its true proportions before any image or text loads.
 */
interface PageRow {
  pageNumber: number;
  width: number | null;
  height: number | null;
  hasImage: boolean;
  textSource: string | null;
  garbled: number | null;
  detectedQuestions: number;
}

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await getAuthenticatedUser(['ADMIN']);
  if ('error' in auth) return auth.error;
  const { id } = await params;

  const run = await prisma.bookIngestionRun.findFirst({
    where: { bookId: id },
    orderBy: { createdAt: 'desc' },
    select: { id: true, fileName: true, totalPages: true, sourceDocumentId: true, draftExpiresAt: true, draftPurgedAt: true, createdAt: true, book: { select: { title: true } } },
  });
  if (!run) return NextResponse.json({ error: 'No PDF has been uploaded for this book yet' }, { status: 404 });

  const now = new Date();
  const draft = {
    expiresAt: run.draftExpiresAt,
    purgedAt: run.draftPurgedAt,
    daysRemaining: run.draftExpiresAt && !run.draftPurgedAt ? daysUntilExpiry(run.draftExpiresAt, now) : null,
  };
  const header = { bookId: id, bookTitle: run.book.title, runId: run.id, fileName: run.fileName, pdfPages: run.totalPages, draft };

  if (run.draftPurgedAt) return NextResponse.json({ ...header, pages: [], parity: null, textLayers: null });
  if (!run.sourceDocumentId || !run.totalPages) return NextResponse.json({ ...header, pages: [], parity: null, textLayers: null });

  // The text layer itself is large; read only its source and garble ratio here.
  const pages = await prisma.$queryRaw<PageRow[]>`
    SELECT "pageNumber", "width", "height", "detectedQuestions",
           ("pageImagePath" IS NOT NULL) AS "hasImage",
           "textLayer"->>'source' AS "textSource",
           ("textLayer"->>'garbled')::float AS "garbled"
    FROM "DocumentPage"
    WHERE "documentId" = ${run.sourceDocumentId}
    ORDER BY "pageNumber"`;

  const parity = comparePages(run.totalPages, pages.map(page => ({ pageNumber: page.pageNumber, hasImage: page.hasImage, hasText: page.textSource != null })));
  const garbledNative = pages.filter(page => page.textSource === 'NATIVE_PDF' && (page.garbled ?? 0) >= GARBLED_NATIVE_THRESHOLD).length;
  const textLayers = {
    native: pages.filter(page => page.textSource === 'NATIVE_PDF').length - garbledNative,
    garbledNative,
    ocr: pages.filter(page => page.textSource === 'MATHPIX_OCR').length,
    none: pages.filter(page => page.textSource == null).length,
  };
  return NextResponse.json({ ...header, pages, parity, textLayers });
}
