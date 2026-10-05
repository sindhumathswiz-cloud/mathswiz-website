import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getAuthenticatedUser } from '@/lib/auth-server';
import { recordAuditLog, requestAuditContext } from '@/lib/audit-log';

export const runtime = 'nodejs';

/**
 * Approves, in one step, every DRAFT item in a chapter that matched its source
 * page EXACTLY and carry no review note. Items that differ from the page (close or
 * mismatched), and exact copies flagged for another reason (math left unclosed,
 * found on an exercise page), are never swept in: those need an individual look.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await getAuthenticatedUser(['ADMIN']);
  if ('error' in auth) return auth.error;
  const { id } = await params;
  const body = await request.json().catch(() => ({}));
  const chapterId = typeof body.chapterId === 'string' ? body.chapterId : '';
  if (!chapterId) return NextResponse.json({ error: 'chapterId is required' }, { status: 400 });

  const chapter = await prisma.bookChapter.findFirst({ where: { id: chapterId, bookId: id }, select: { id: true } });
  if (!chapter) return NextResponse.json({ error: 'Chapter not found' }, { status: 404 });

  const result = await prisma.revisionItem.updateMany({
    where: { bookId: id, chapterId, status: 'DRAFT', verbatimScore: 1, reviewNotes: null },
    data: { status: 'APPROVED', reviewedById: auth.user.id, reviewedAt: new Date() },
  });
  const remaining = await prisma.revisionItem.count({ where: { bookId: id, chapterId, status: 'DRAFT' } });

  await recordAuditLog({
    actorId: auth.user.id, actorRole: 'ADMIN', action: 'BOOK_REVISION_CONTENT_APPROVED', entityType: 'BookChapter', entityId: chapter.id,
    metadata: { bookId: id, approved: result.count, remainingForReview: remaining, scope: 'EXACT_MATCHES' }, ...requestAuditContext(request),
  });
  return NextResponse.json({ approved: result.count, remainingForReview: remaining });
}
