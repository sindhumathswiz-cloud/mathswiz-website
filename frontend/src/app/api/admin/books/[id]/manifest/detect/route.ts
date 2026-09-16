import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getAuthenticatedUser } from '@/lib/auth-server';
import { recordAuditLog, requestAuditContext } from '@/lib/audit-log';
import { detectManifest, parseTableOfContents } from '@/lib/book-manifest';

export const runtime = 'nodejs';
export const maxDuration = 120;

/**
 * Propose a chapter manifest from the newest ingestion run's OCR'd page text.
 * Read-only -- writes nothing; the admin reviews/edits the proposal and saves
 * it via PUT .../manifest. See lib/book-manifest.ts `detectManifest`.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await getAuthenticatedUser(['ADMIN']);
  if ('error' in auth) return auth.error;
  const { id } = await params;

  const book = await prisma.book.findUnique({
    where: { id },
    select: {
      id: true,
      className: true,
      ingestionRuns: { orderBy: { createdAt: 'desc' }, take: 1, select: { id: true, sourceDocumentId: true, totalPages: true } },
    },
  });
  if (!book) return NextResponse.json({ error: 'Book not found' }, { status: 404 });

  const run = book.ingestionRuns[0];
  if (!run?.sourceDocumentId) {
    return NextResponse.json({ error: 'Upload and render this book before detecting a manifest.' }, { status: 409 });
  }

  // rawText is only ever written by extract-questions/route.ts, once the LLM
  // structuring pass runs. For a DIGITAL_MATH book, render-pages already
  // captures the PDF's own embedded text layer as nativeText -- plenty for
  // manifest detection (chapter openers, TOC, section headings), so gating
  // this on rawText alone forced running the (slow, provider-rate-limited)
  // extraction pass BEFORE the manifest could even be reviewed, defeating
  // the point of confirming a manifest before extracting. Falls back to
  // nativeText per page when rawText isn't there yet.
  const rows = await prisma.documentPage.findMany({
    where: { documentId: run.sourceDocumentId, OR: [{ rawText: { not: '' } }, { nativeText: { not: '' } }] },
    orderBy: { pageNumber: 'asc' },
    select: { pageNumber: true, rawText: true, nativeText: true, layoutData: true },
  });
  if (rows.length === 0) {
    return NextResponse.json({ error: 'No page text is available yet. Render the pages first -- a scanned/photographed book only gets usable text after its first OCR pass (Extract questions).' }, { status: 409 });
  }
  const pages = rows.map((row) => ({ pageNumber: row.pageNumber, rawText: row.rawText || row.nativeText || '', layoutData: row.layoutData }));

  const toc = parseTableOfContents(pages);
  const proposal = detectManifest(pages, book.className, {
    tocEntries: toc.entries.length ? toc.entries : undefined,
    partBPrintedPage: toc.partBPrintedPage,
  });

  await recordAuditLog({
    actorId: auth.user.id,
    actorRole: 'ADMIN',
    action: 'BOOK_MANIFEST_DETECTED',
    entityType: 'Book',
    entityId: id,
    metadata: { bookId: id, pagesScanned: pages.length, chaptersProposed: proposal.chapters.length, tocFound: proposal.tocFound, pageOffset: proposal.pageOffset },
    ...requestAuditContext(request),
  });

  return NextResponse.json({
    runId: run.id,
    totalPages: run.totalPages,
    pagesScanned: pages.length,
    tocFound: proposal.tocFound,
    pageOffset: proposal.pageOffset,
    proposal,
  });
}
