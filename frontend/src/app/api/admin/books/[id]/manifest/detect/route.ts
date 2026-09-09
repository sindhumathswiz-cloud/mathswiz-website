import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getAuthenticatedUser } from '@/lib/auth-server';
import { recordAuditLog, requestAuditContext } from '@/lib/audit-log';
import { detectManifest } from '@/lib/book-manifest';

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
    return NextResponse.json({ error: 'Render and extract this book before detecting a manifest.' }, { status: 409 });
  }

  const pages = await prisma.documentPage.findMany({
    where: { documentId: run.sourceDocumentId, rawText: { not: '' } },
    orderBy: { pageNumber: 'asc' },
    select: { pageNumber: true, rawText: true, layoutData: true },
  });
  if (pages.length === 0) {
    return NextResponse.json({ error: 'No page text is available yet. Render the pages first.' }, { status: 409 });
  }

  const proposal = detectManifest(pages, book.className);

  await recordAuditLog({
    actorId: auth.user.id,
    actorRole: 'ADMIN',
    action: 'BOOK_MANIFEST_DETECTED',
    entityType: 'Book',
    entityId: id,
    metadata: { bookId: id, pagesScanned: pages.length, chaptersProposed: proposal.chapters.length },
    ...requestAuditContext(request),
  });

  return NextResponse.json({
    runId: run.id,
    totalPages: run.totalPages,
    pagesScanned: pages.length,
    proposal,
  });
}
