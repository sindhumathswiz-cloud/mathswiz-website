import { NextResponse } from 'next/server';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import prisma from '@/lib/prisma';
import { getAuthenticatedUser } from '@/lib/auth-server';
import { assertPrivatePageImagePath } from '@/lib/book-storage';

export const runtime = 'nodejs';
export const maxDuration = 30;

/**
 * Streams one already-rendered book page's image out of private storage --
 * the read half of the PDF snip-and-paste tool (PageSnipTool.tsx), which
 * needs to actually SHOW the admin the source page to draw a selection box
 * on. Book-scoped (not run-scoped) like manifest/detect and
 * verify-mathematics: resolves the book's newest ingestion run internally
 * rather than making the client plumb a runId through just to view a page.
 *
 * Mirrors ingestions/[runId]/question-images/[...path]/route.ts's auth +
 * streaming pattern; the only real difference is resolving the file via
 * DocumentPage.pageNumber instead of a caller-supplied file name.
 */

function contentTypeFor(filePath: string): string {
  const extension = path.extname(filePath).toLowerCase();
  if (extension === '.png') return 'image/png';
  if (extension === '.webp') return 'image/webp';
  return 'image/jpeg';
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string; pageNumber: string }> },
) {
  const auth = await getAuthenticatedUser(['ADMIN']);
  if ('error' in auth) return auth.error;
  const { id, pageNumber: pageNumberParam } = await params;

  const pageNumber = Number.parseInt(pageNumberParam, 10);
  if (!Number.isInteger(pageNumber) || pageNumber < 1) {
    return NextResponse.json({ error: 'Invalid page number' }, { status: 400 });
  }

  const book = await prisma.book.findUnique({
    where: { id },
    select: { ingestionRuns: { orderBy: { createdAt: 'desc' }, take: 1, select: { sourceDocumentId: true } } },
  });
  const sourceDocumentId = book?.ingestionRuns[0]?.sourceDocumentId;
  if (!sourceDocumentId) return NextResponse.json({ error: 'Book ingestion run not found' }, { status: 404 });

  const page = await prisma.documentPage.findFirst({
    where: { documentId: sourceDocumentId, pageNumber },
    select: { processedImagePath: true, pageImagePath: true },
  });
  const imagePath = page?.processedImagePath || page?.pageImagePath;
  if (!imagePath) return NextResponse.json({ error: 'Page image not found' }, { status: 404 });

  let resolved: string;
  try {
    resolved = assertPrivatePageImagePath(imagePath);
  } catch {
    return NextResponse.json({ error: 'Invalid page image path' }, { status: 400 });
  }

  try {
    const bytes = await readFile(resolved);
    return new NextResponse(bytes, {
      headers: {
        'Content-Type': contentTypeFor(resolved),
        'Cache-Control': 'private, max-age=86400',
      },
    });
  } catch {
    return NextResponse.json({ error: 'Image not found' }, { status: 404 });
  }
}
