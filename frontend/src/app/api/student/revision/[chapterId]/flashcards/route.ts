import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import prisma from '@/lib/prisma';
import { authOptions } from '@/lib/auth';
import { isPremiumSubscription } from '@/lib/subscription';
import { flashcardFromItem, withUniqueFronts } from '@/lib/revision-content';

export const dynamic = 'force-dynamic';

/**
 * Copies a chapter's approved revision items into the student's own flashcards,
 * where the existing study mode and spaced-repetition scheduling take over.
 * Adding an item twice does nothing (unique per student + item). Premium only,
 * and only for books written for the student's own class.
 *
 * Body: { itemIds?: string[] } -- omit to add the whole chapter.
 */
export async function POST(request: Request, { params }: { params: Promise<{ chapterId: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id || session.user.role !== 'STUDENT') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { chapterId } = await params;

  const student = await prisma.user.findUnique({ where: { id: session.user.id }, select: { subscription: true, class: true } });
  if (!isPremiumSubscription(student?.subscription)) return NextResponse.json({ error: 'Revision sheets are part of Premium' }, { status: 403 });

  const body = await request.json().catch(() => ({}));
  const wanted = Array.isArray(body?.itemIds) ? body.itemIds.filter((id: unknown): id is string => typeof id === 'string').slice(0, 500) : null;

  const chapter = await prisma.bookChapter.findFirst({ where: { id: chapterId, book: { className: student?.class ?? '__none__' } }, select: { id: true, name: true } });
  if (!chapter) return NextResponse.json({ error: 'Chapter not found' }, { status: 404 });

  const items = await prisma.revisionItem.findMany({
    where: { chapterId, status: 'APPROVED', ...(wanted ? { id: { in: wanted } } : {}) },
    orderBy: { orderIndex: 'asc' },
    select: { id: true, kind: true, title: true, body: true, sourcePage: true },
  });
  if (items.length === 0) return NextResponse.json({ added: 0, alreadyAdded: 0 });

  const result = await prisma.studentFlashcard.createMany({
    data: withUniqueFronts(items.map(item => ({ item, sourcePage: item.sourcePage, ...flashcardFromItem(item) })))
      .map(({ item, front, back }) => ({ userId: session.user.id, revisionItemId: item.id, topic: chapter.name, front, back })),
    skipDuplicates: true,
  });
  return NextResponse.json({ added: result.count, alreadyAdded: items.length - result.count });
}
