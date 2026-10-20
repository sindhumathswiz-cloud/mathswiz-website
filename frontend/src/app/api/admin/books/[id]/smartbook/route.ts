import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getAuthenticatedUser } from '@/lib/auth-server';
import { recordAuditLog, requestAuditContext } from '@/lib/audit-log';

/**
 * Publishes a book as a Smartbook ({ publish: true }) or withdraws it ({ publish: false }). A published book is
 * readable by students of its class, page by page beside its approved questions, and its pages are kept out of the
 * 60-day draft clean-up. Refused when the pages are already gone: students would see blank pages.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await getAuthenticatedUser(['ADMIN']);
  if ('error' in auth) return auth.error;
  const { id } = await params;
  const body = await request.json().catch(() => null);
  if (typeof body?.publish !== 'boolean') return NextResponse.json({ error: 'publish (true or false) is required' }, { status: 400 });

  const book = await prisma.book.findUnique({
    where: { id },
    select: {
      id: true,
      title: true,
      ingestionRuns: { orderBy: { createdAt: 'desc' }, take: 1, select: { sourceDocumentId: true, draftPurgedAt: true } },
    },
  });
  if (!book) return NextResponse.json({ error: 'Book not found' }, { status: 404 });

  if (body.publish) {
    const run = book.ingestionRuns[0];
    if (!run?.sourceDocumentId) return NextResponse.json({ error: 'Upload and render the book before publishing it as a Smartbook.' }, { status: 409 });
    if (run.draftPurgedAt) return NextResponse.json({ error: 'This book\'s pages were removed by the draft clean-up. Render it again from its PDF, then publish.' }, { status: 409 });
    const withImages = await prisma.documentPage.count({ where: { documentId: run.sourceDocumentId, OR: [{ pageImagePath: { not: null } }, { processedImagePath: { not: null } }] } });
    if (withImages === 0) return NextResponse.json({ error: 'None of this book\'s pages has an image yet. Render the pages, then publish.' }, { status: 409 });
  }

  const updated = await prisma.book.update({
    where: { id },
    data: { smartbookPublishedAt: body.publish ? new Date() : null },
    select: { id: true, smartbookPublishedAt: true },
  });
  await recordAuditLog({
    actorId: auth.user.id,
    actorRole: 'ADMIN',
    action: body.publish ? 'BOOK_SMARTBOOK_PUBLISHED' : 'BOOK_SMARTBOOK_WITHDRAWN',
    entityType: 'Book',
    entityId: id,
    metadata: { title: book.title },
    ...requestAuditContext(request),
  });
  return NextResponse.json({ book: updated });
}
