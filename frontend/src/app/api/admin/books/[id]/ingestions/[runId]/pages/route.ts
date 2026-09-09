import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getAuthenticatedUser } from '@/lib/auth-server';

export const runtime = 'nodejs';
export const maxDuration = 60;

/**
 * Read-only page inspector: returns the raw OCR'd/native text for a range of
 * a book ingestion run's pages. Didn't exist before -- every pipeline route
 * reads DocumentPage.rawText internally, but there was no admin-facing way
 * to actually LOOK at what got captured for a given page without writing a
 * one-off script. Useful for designing/debugging any text-pattern-based pass
 * (answer-key detection, detailed-solutions detection, etc.) against the
 * real OCR output instead of guessing blind.
 *
 * GET .../pages?start=20&end=30  (defaults: start=1, end=start+9; capped at
 * MAX_RANGE pages per call so a careless huge range can't blow up the
 * response).
 */

const MAX_RANGE = 25;

export async function GET(request: Request, { params }: { params: Promise<{ id: string; runId: string }> }) {
  const auth = await getAuthenticatedUser(['ADMIN']);
  if ('error' in auth) return auth.error;
  const { id, runId } = await params;

  const url = new URL(request.url);
  const start = Math.max(1, parseInt(url.searchParams.get('start') || '1', 10) || 1);
  const requestedEnd = parseInt(url.searchParams.get('end') || '', 10);
  const end = Number.isFinite(requestedEnd) && requestedEnd > 0
    ? Math.min(requestedEnd, start + MAX_RANGE - 1)
    : start + 9;

  const run = await prisma.bookIngestionRun.findFirst({
    where: { id: runId, bookId: id },
    select: { id: true, sourceDocumentId: true },
  });
  if (!run?.sourceDocumentId) return NextResponse.json({ error: 'Book ingestion run not found' }, { status: 404 });

  const pages = await prisma.documentPage.findMany({
    where: { documentId: run.sourceDocumentId, pageNumber: { gte: start, lte: end } },
    orderBy: { pageNumber: 'asc' },
    select: { pageNumber: true, status: true, rawText: true, detectedQuestions: true },
  });

  return NextResponse.json({ start, end, pages });
}
