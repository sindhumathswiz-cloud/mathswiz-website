import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getAuthenticatedUser } from '@/lib/auth-server';
import { recordAuditLog, requestAuditContext } from '@/lib/audit-log';

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await getAuthenticatedUser(['ADMIN']);
  if ('error' in auth) return auth.error;
  const { id } = await params;
  const book = await prisma.book.findUnique({
    where: { id },
    include: {
      chapters: { include: { exercises: { orderBy: { orderIndex: 'asc' } }, _count: { select: { questions: true } } }, orderBy: { orderIndex: 'asc' } },
      ingestionRuns: { orderBy: { createdAt: 'desc' } },
      _count: { select: { questions: true, sourceDocuments: true } },
    },
  });
  return book ? NextResponse.json({ book }) : NextResponse.json({ error: 'Book not found' }, { status: 404 });
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await getAuthenticatedUser(['ADMIN']);
  if ('error' in auth) return auth.error;
  const { id } = await params;
  const body = await request.json().catch(() => null);
  if (!body || !Array.isArray(body.chapters)) return NextResponse.json({ error: 'chapters array is required' }, { status: 400 });
  const book = await prisma.book.findUnique({ where: { id }, select: { id: true, _count: { select: { chapters: true } } } });
  if (!book) return NextResponse.json({ error: 'Book not found' }, { status: 404 });
  if (book._count.chapters > 0) return NextResponse.json({ error: 'A chapter map already exists; review it before replacing individual chapters' }, { status: 409 });

  const chapters: Array<{ bookId: string; chapterNumber: string | null; name: string; orderIndex: number; startPage: number | null; endPage: number | null; topic: string | null }> = body.chapters.slice(0, 100).map((chapter: any, index: number) => ({
    bookId: id,
    chapterNumber: typeof chapter.chapterNumber === 'string' ? chapter.chapterNumber.trim().slice(0, 30) || null : null,
    name: typeof chapter.name === 'string' ? chapter.name.trim().slice(0, 200) : '',
    orderIndex: index,
    startPage: Number.isInteger(chapter.startPage) ? chapter.startPage : null,
    endPage: Number.isInteger(chapter.endPage) ? chapter.endPage : null,
    topic: typeof chapter.topic === 'string' ? chapter.topic.trim().slice(0, 200) || null : null,
  }));
  if (chapters.length === 0 || chapters.some((chapter: { name: string }) => !chapter.name)) {
    return NextResponse.json({ error: 'Every chapter requires a name' }, { status: 400 });
  }
  await prisma.bookChapter.createMany({ data: chapters });
  await recordAuditLog({ actorId: auth.user.id, actorRole: 'ADMIN', action: 'BOOK_MAP_UPDATED', entityType: 'Book', entityId: id, metadata: { chapterCount: chapters.length }, ...requestAuditContext(request) });
  return NextResponse.json({ success: true, chapterCount: chapters.length });
}
