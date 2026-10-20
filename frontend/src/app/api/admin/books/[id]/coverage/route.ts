import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getAuthenticatedUser } from '@/lib/auth-server';
import { recordAuditLog, requestAuditContext } from '@/lib/audit-log';
import { buildCoverage } from '@/lib/book-coverage';

export const dynamic = 'force-dynamic';

async function coverageOf(bookId: string) {
  const [chapters, questions] = await Promise.all([
    prisma.bookChapter.findMany({
      where: { bookId },
      select: { id: true, name: true, topic: true, startPage: true, endPage: true, manifestConfirmedAt: true, _count: { select: { exercises: true } } },
    }),
    prisma.question.findMany({
      where: { bookId },
      select: { id: true, bookChapterId: true, status: true, sourcePageStart: true, explanation: true },
    }),
  ]);
  const coverage = buildCoverage(
    chapters.map((c) => ({ id: c.id, name: c.name, startPage: c.startPage, endPage: c.endPage, manifestConfirmed: c.manifestConfirmedAt != null, exerciseCount: c._count.exercises })),
    questions.map((q) => ({ id: q.id, bookChapterId: q.bookChapterId, status: q.status, sourcePageStart: q.sourcePageStart, hasSolution: Boolean(q.explanation?.trim()) })),
  );
  return { coverage, chapters };
}

/** Chapter-by-chapter coverage of a book's questions, and the questions filed under no real chapter. */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await getAuthenticatedUser(['ADMIN']);
  if ('error' in auth) return auth.error;
  const { id } = await params;
  const book = await prisma.book.findUnique({ where: { id }, select: { id: true, title: true } });
  if (!book) return NextResponse.json({ error: 'Book not found' }, { status: 404 });
  const { coverage, chapters } = await coverageOf(id);
  const names = new Map(chapters.map((c) => [c.id, c.name]));
  return NextResponse.json({
    book,
    ...coverage,
    misfiled: coverage.misfiled.map((m) => ({ ...m, chapterName: m.chapterId ? names.get(m.chapterId) ?? null : null, belongsToName: m.belongsTo ? names.get(m.belongsTo) ?? null : null })),
  });
}

/**
 * Refiles misfiled questions under the real chapter whose pages contain the page they start on. A question whose
 * page fits no chapter (or two) is left alone. Each refiled question gets a review note saying where it was.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await getAuthenticatedUser(['ADMIN']);
  if ('error' in auth) return auth.error;
  const { id } = await params;
  const { coverage, chapters } = await coverageOf(id);
  const byId = new Map(chapters.map((c) => [c.id, c]));
  const movable = coverage.misfiled.filter((m) => m.belongsTo);

  for (const m of movable) {
    const target = byId.get(m.belongsTo as string)!;
    const from = m.chapterId ? byId.get(m.chapterId)?.name ?? 'an unknown chapter' : 'no chapter';
    const current = await prisma.question.findUnique({ where: { id: m.id }, select: { reviewNotes: true } });
    const note = `Refiled by page ${m.page}: was under "${from}", now "${target.name}".`;
    await prisma.question.update({
      where: { id: m.id },
      data: { bookChapterId: target.id, topic: target.topic || target.name, reviewNotes: current?.reviewNotes ? `${note}\n${current.reviewNotes}` : note },
    });
  }
  await recordAuditLog({
    actorId: auth.user.id, actorRole: 'ADMIN', action: 'BOOK_QUESTIONS_REFILED', entityType: 'Book', entityId: id,
    metadata: { refiled: movable.map((m) => ({ id: m.id, from: m.chapterId, to: m.belongsTo })), leftAlone: coverage.misfiled.length - movable.length },
    ...requestAuditContext(request),
  });
  return NextResponse.json({ refiled: movable.length, leftAlone: coverage.misfiled.length - movable.length });
}
