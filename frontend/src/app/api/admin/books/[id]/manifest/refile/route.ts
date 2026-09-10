import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getAuthenticatedUser } from '@/lib/auth-server';
import { recordAuditLog, requestAuditContext } from '@/lib/audit-log';
import { loadConfirmedChapters } from '@/lib/book-manifest';

export const runtime = 'nodejs';
export const maxDuration = 120;

/**
 * Re-file every DRAFT question of this book under the confirmed chapter whose
 * page range contains the question's source page. Used to bring the 1020
 * questions that were filed under stale LLM topic-guess chapters into line
 * with a freshly confirmed manifest, without re-running extraction.
 *
 * DRAFT only (never touches approved/archived work); books with no confirmed
 * chapters are a no-op.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await getAuthenticatedUser(['ADMIN']);
  if ('error' in auth) return auth.error;
  const { id } = await params;

  const book = await prisma.book.findUnique({ where: { id }, select: { id: true } });
  if (!book) return NextResponse.json({ error: 'Book not found' }, { status: 404 });

  const chapters = await loadConfirmedChapters(id);
  if (chapters.length === 0) {
    return NextResponse.json({ error: 'Confirm at least one chapter first.' }, { status: 409 });
  }

  const results: Array<{ chapter: string; refiled: number }> = [];
  let total = 0;
  for (const chapter of chapters) {
    if (chapter.startPage == null || chapter.endPage == null) continue;
    const { count } = await prisma.question.updateMany({
      where: {
        bookId: id,
        status: 'DRAFT',
        sourcePageStart: { gte: chapter.startPage, lte: chapter.endPage },
        NOT: { bookChapterId: chapter.id },
      },
      data: { bookChapterId: chapter.id, topic: chapter.topic || chapter.name },
    });
    total += count;
    results.push({ chapter: chapter.name, refiled: count });
  }

  await recordAuditLog({
    actorId: auth.user.id,
    actorRole: 'ADMIN',
    action: 'BOOK_QUESTIONS_REFILED',
    entityType: 'Book',
    entityId: id,
    metadata: { bookId: id, total, perChapter: results },
    ...requestAuditContext(request),
  });

  return NextResponse.json({ total, results });
}
