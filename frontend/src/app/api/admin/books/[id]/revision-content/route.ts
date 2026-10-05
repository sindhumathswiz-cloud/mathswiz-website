import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getAuthenticatedUser } from '@/lib/auth-server';
import { verbatimTier } from '@/lib/revision-content';

export const runtime = 'nodejs';

/**
 * The review screen's data: every chapter of the book with how many revision
 * items it has in each state, and -- when `chapterId` is given -- that chapter's
 * items with their verbatim tier against the source page.
 */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await getAuthenticatedUser(['ADMIN']);
  if ('error' in auth) return auth.error;
  const { id } = await params;
  const chapterId = new URL(request.url).searchParams.get('chapterId');

  const book = await prisma.book.findUnique({ where: { id }, select: { id: true, title: true, className: true } });
  if (!book) return NextResponse.json({ error: 'Book not found' }, { status: 404 });

  const [chapters, counts] = await Promise.all([
    prisma.bookChapter.findMany({
      where: { bookId: id, startPage: { not: null } },
      orderBy: { startPage: 'asc' },
      select: { id: true, chapterNumber: true, name: true, startPage: true, endPage: true },
    }),
    prisma.revisionItem.groupBy({ by: ['chapterId', 'status'], where: { bookId: id }, _count: { _all: true } }),
  ]);
  const byChapter = new Map<string, { DRAFT: number; APPROVED: number; ARCHIVED: number }>();
  for (const row of counts) {
    const entry = byChapter.get(row.chapterId) ?? { DRAFT: 0, APPROVED: 0, ARCHIVED: 0 };
    entry[row.status] = row._count._all;
    byChapter.set(row.chapterId, entry);
  }

  const items = chapterId
    ? (await prisma.revisionItem.findMany({
        where: { bookId: id, chapterId, status: { not: 'ARCHIVED' } },
        orderBy: { orderIndex: 'asc' },
      })).map(item => ({ ...item, tier: verbatimTier(item.verbatimScore) }))
    : [];

  return NextResponse.json({
    book,
    chapters: chapters.map(chapter => ({ ...chapter, counts: byChapter.get(chapter.id) ?? { DRAFT: 0, APPROVED: 0, ARCHIVED: 0 } })),
    items,
  });
}
