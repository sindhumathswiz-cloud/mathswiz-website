import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getAuthenticatedUser } from '@/lib/auth-server';
import { parseTextLayer } from '@/lib/page-text-layer';

export const runtime = 'nodejs';

/** One page's selectable text, positioned as fractions of the page. */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string; pageNumber: string }> }) {
  const auth = await getAuthenticatedUser(['ADMIN']);
  if ('error' in auth) return auth.error;
  const { id, pageNumber: pageParam } = await params;
  const pageNumber = Number.parseInt(pageParam, 10);
  if (!Number.isInteger(pageNumber) || pageNumber < 1) return NextResponse.json({ error: 'Invalid page number' }, { status: 400 });

  const run = await prisma.bookIngestionRun.findFirst({
    where: { bookId: id },
    orderBy: { createdAt: 'desc' },
    select: { sourceDocumentId: true, draftPurgedAt: true },
  });
  if (!run?.sourceDocumentId) return NextResponse.json({ error: 'Book ingestion run not found' }, { status: 404 });
  if (run.draftPurgedAt) return NextResponse.json({ error: 'This draft expired and its pages were deleted' }, { status: 410 });

  const page = await prisma.documentPage.findFirst({
    where: { documentId: run.sourceDocumentId, pageNumber },
    select: { textLayer: true, width: true, height: true },
  });
  if (!page) return NextResponse.json({ error: 'Page not found' }, { status: 404 });

  return NextResponse.json({ pageNumber, width: page.width, height: page.height, textLayer: parseTextLayer(page.textLayer) }, { headers: { 'Cache-Control': 'private, max-age=60' } });
}
