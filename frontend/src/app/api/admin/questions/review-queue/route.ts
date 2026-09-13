import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import type { Prisma } from '@prisma/client';
import { getAuthenticatedUser } from '@/lib/auth-server';

export const dynamic = 'force-dynamic';

const PAGE_SIZE = 24;

/**
 * The human review queue: every DRAFT/REPORTED question flagged either by
 * the manual second review (`Second-Review: Flagged` tag) or the automated
 * AI-assisted verification pass (`AI-Verified: Flagged` tag), OR whose
 * verificationStatus is NEEDS_REVIEW for any other reason (e.g. a
 * content-agreement disagreement from match-detailed-solutions). Cursor-
 * paginated, mirroring the figures-review route's shape.
 */
export async function GET(request: Request) {
  const auth = await getAuthenticatedUser(['ADMIN']);
  if ('error' in auth) return auth.error;

  const params = new URL(request.url).searchParams;
  const bookId = params.get('bookId') || undefined;
  const search = params.get('search')?.trim() || undefined;
  const cursor = params.get('cursor') || undefined;

  const where: Prisma.QuestionWhereInput = {
    status: { in: ['DRAFT', 'REPORTED'] },
    OR: [
      { verificationStatus: 'NEEDS_REVIEW' },
      { tags: { hasSome: ['Second-Review: Flagged', 'AI-Verified: Flagged'] } },
    ],
    ...(bookId ? { bookId } : {}),
    ...(search ? { content: { contains: search, mode: 'insensitive' } } : {}),
  };

  const questions = await prisma.question.findMany({
    where,
    orderBy: { id: 'asc' },
    take: PAGE_SIZE + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    select: {
      id: true,
      content: true,
      options: true,
      correctAnswer: true,
      type: true,
      status: true,
      verificationStatus: true,
      tags: true,
      reviewNotes: true,
      topic: true,
      subTopic: true,
      sourcePageStart: true,
      bookId: true,
      book: { select: { title: true } },
    },
  });

  const nextCursor = questions.length > PAGE_SIZE ? questions[PAGE_SIZE].id : null;
  const page = questions.slice(0, PAGE_SIZE);

  return NextResponse.json({ questions: page, nextCursor });
}
