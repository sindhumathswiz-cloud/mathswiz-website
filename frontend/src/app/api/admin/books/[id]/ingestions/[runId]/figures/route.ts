import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getAuthenticatedUser } from '@/lib/auth-server';

export const runtime = 'nodejs';
export const maxDuration = 60;

/**
 * Lists the figures captured for a book ingestion run -- every diagram/
 * chart/graph Mathpix detected on an OCR'd page, cropped and saved as its
 * own PageFigure row regardless of whether extraction could match it to a
 * question (see capturePageFigures in extract-questions/route.ts). This is
 * the review surface for that capture-everything pipeline: an admin can see
 * every figure a page produced -- matched (and by what method) or not -- and
 * fix a miss without re-running OCR or cropping.
 *
 * GET .../figures?pageStart=&pageEnd=&unmatchedOnly=true&limit=&cursor=
 *  - pageStart/pageEnd: optional page-number window (defaults to the whole run).
 *  - unmatchedOnly=true: only figures with no questionId yet.
 *  - limit (default 50, max 200) + cursor (a figure id) for paging.
 *
 * Each figure includes its linked question's id/printedNumber/content
 * snippet when matched, and a light place to attach one that isn't:
 * `pageCandidates` lists every non-archived question sourced from that same
 * page, for the review UI's "assign to..." picker.
 */

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;
const SNIPPET_LENGTH = 140;

function snippet(content: string): string {
  return content.replace(/\s+/g, ' ').trim().slice(0, SNIPPET_LENGTH);
}

export async function GET(request: Request, { params }: { params: Promise<{ id: string; runId: string }> }) {
  const auth = await getAuthenticatedUser(['ADMIN']);
  if ('error' in auth) return auth.error;
  const { id, runId } = await params;

  const run = await prisma.bookIngestionRun.findFirst({ where: { id: runId, bookId: id }, select: { id: true } });
  if (!run) return NextResponse.json({ error: 'Book ingestion run not found' }, { status: 404 });

  const url = new URL(request.url);
  const pageStart = Number.parseInt(url.searchParams.get('pageStart') || '', 10);
  const pageEnd = Number.parseInt(url.searchParams.get('pageEnd') || '', 10);
  const unmatchedOnly = url.searchParams.get('unmatchedOnly') === 'true';
  const limit = Math.min(MAX_LIMIT, Math.max(1, Number.parseInt(url.searchParams.get('limit') || '', 10) || DEFAULT_LIMIT));
  const cursor = url.searchParams.get('cursor') || undefined;

  const pageRange = Number.isFinite(pageStart) || Number.isFinite(pageEnd)
    ? { ...(Number.isFinite(pageStart) ? { gte: pageStart } : {}), ...(Number.isFinite(pageEnd) ? { lte: pageEnd } : {}) }
    : undefined;

  const figures = await prisma.pageFigure.findMany({
    where: {
      bookId: id,
      ...(pageRange ? { pageNumber: pageRange } : {}),
      ...(unmatchedOnly ? { questionId: null } : {}),
    },
    orderBy: [{ pageNumber: 'asc' }, { orderIndex: 'asc' }],
    take: limit + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    select: {
      id: true, pageNumber: true, x: true, y: true, width: true, height: true,
      imageType: true, imageUrl: true, questionId: true, matchedAutomatically: true, reviewedAt: true,
      question: { select: { id: true, printedNumber: true, content: true, status: true } },
    },
  });

  const nextCursor = figures.length > limit ? figures[limit].id : null;
  const page = figures.slice(0, limit);

  const pageNumbers = [...new Set(page.map((f) => f.pageNumber))];
  const candidateRows = pageNumbers.length
    ? await prisma.question.findMany({
        where: { bookId: id, sourcePageStart: { in: pageNumbers }, status: { not: 'ARCHIVED' } },
        select: { id: true, sourcePageStart: true, printedNumber: true, content: true },
      })
    : [];
  const pageCandidates: Record<number, Array<{ id: string; printedNumber: string | null; content: string }>> = {};
  for (const q of candidateRows) {
    const p = q.sourcePageStart as number;
    (pageCandidates[p] ??= []).push({ id: q.id, printedNumber: q.printedNumber, content: snippet(q.content) });
  }

  return NextResponse.json({
    figures: page.map((f) => ({
      id: f.id, pageNumber: f.pageNumber, x: f.x, y: f.y, width: f.width, height: f.height,
      imageType: f.imageType, imageUrl: f.imageUrl,
      questionId: f.questionId, matchedAutomatically: f.matchedAutomatically, reviewedAt: f.reviewedAt,
      question: f.question ? { id: f.question.id, printedNumber: f.question.printedNumber, content: snippet(f.question.content), status: f.question.status } : null,
    })),
    pageCandidates,
    nextCursor,
  });
}
