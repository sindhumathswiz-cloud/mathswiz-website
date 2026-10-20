import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getAuthenticatedUser } from '@/lib/auth-server';

export const runtime = 'nodejs';

const MAX_QUESTIONS = 120;

/**
 * The questions extracted from a book that start on, or run into, a page range: what the side-by-side reader
 * lists next to the pages so a teacher can compare each with the original and correct it.
 *
 *   GET ?from=8&to=9          questions on pages 8-9
 *   GET ?questionId=abc       that question's page, and everything else on the same page
 */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await getAuthenticatedUser(['ADMIN']);
  if ('error' in auth) return auth.error;
  const { id } = await params;
  const url = new URL(request.url);

  let from = Number.parseInt(url.searchParams.get('from') ?? '', 10);
  let to = Number.parseInt(url.searchParams.get('to') ?? '', 10);
  const questionId = url.searchParams.get('questionId');

  if (questionId) {
    const anchor = await prisma.question.findFirst({ where: { id: questionId, bookId: id }, select: { sourcePageStart: true, sourcePageEnd: true } });
    if (!anchor) return NextResponse.json({ error: 'That question is not part of this book' }, { status: 404 });
    from = anchor.sourcePageStart ?? Number.NaN;
    to = anchor.sourcePageEnd ?? anchor.sourcePageStart ?? Number.NaN;
  }
  if (!Number.isInteger(from) || from < 1) return NextResponse.json({ error: 'A page range (from, to) or a questionId is required' }, { status: 400 });
  if (!Number.isInteger(to) || to < from) to = from;
  if (to - from > 5) return NextResponse.json({ error: 'Ask for at most six pages at a time' }, { status: 400 });

  const questions = await prisma.question.findMany({
    where: {
      bookId: id,
      status: { not: 'ARCHIVED' },
      sourcePageStart: { lte: to },
      OR: [{ sourcePageEnd: { gte: from } }, { sourcePageEnd: null, sourcePageStart: { gte: from } }],
    },
    select: {
      id: true, status: true, type: true, content: true, options: true, correctAnswer: true, explanation: true,
      printedNumber: true, sourcePageStart: true, sourcePageEnd: true, verificationStatus: true, reviewNotes: true, tags: true,
    },
    orderBy: [{ sourcePageStart: 'asc' }, { printedNumber: 'asc' }, { createdAt: 'asc' }],
    take: MAX_QUESTIONS,
  });

  return NextResponse.json({ from, to, questions, truncated: questions.length === MAX_QUESTIONS });
}
