import { NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import prisma from '@/lib/prisma';
import { getAuthenticatedUser } from '@/lib/auth-server';
import { recordAuditLog, requestAuditContext } from '@/lib/audit-log';
import { REVISION_KINDS, verbatimScore, type RevisionKind } from '@/lib/revision-content';
import { revisionContentHash } from '@/lib/revision-hash';

export const runtime = 'nodejs';

const STATUSES = ['DRAFT', 'APPROVED', 'ARCHIVED'] as const;

/**
 * Review one item: correct its title, kind or text, and approve or archive it.
 * Items are archived, never deleted. Editing the text re-checks it against the
 * source page when that page is still held; once the draft has been purged there
 * is nothing to check against, so the old score is kept as the item's history.
 */
export async function PATCH(request: Request, { params }: { params: Promise<{ itemId: string }> }) {
  const auth = await getAuthenticatedUser(['ADMIN']);
  if ('error' in auth) return auth.error;
  const { itemId } = await params;
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== 'object') return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });

  const item = await prisma.revisionItem.findUnique({ where: { id: itemId } });
  if (!item) return NextResponse.json({ error: 'Item not found' }, { status: 404 });

  const data: Prisma.RevisionItemUpdateInput = {};
  if (body.status !== undefined) {
    if (!(STATUSES as readonly string[]).includes(body.status)) return NextResponse.json({ error: 'Invalid status' }, { status: 400 });
    data.status = body.status;
  }
  if (body.kind !== undefined) {
    if (!(REVISION_KINDS as readonly string[]).includes(body.kind)) return NextResponse.json({ error: 'Invalid kind' }, { status: 400 });
    data.kind = body.kind as RevisionKind;
  }
  if (body.title !== undefined) {
    const title = typeof body.title === 'string' ? body.title.trim() : '';
    if (!title || title.length > 140) return NextResponse.json({ error: 'Title must be 1-140 characters' }, { status: 400 });
    data.title = title;
  }
  if (body.reviewNotes !== undefined) data.reviewNotes = typeof body.reviewNotes === 'string' ? body.reviewNotes.trim().slice(0, 2000) || null : null;

  if (body.body !== undefined) {
    const text = typeof body.body === 'string' ? body.body.trim() : '';
    if (text.length < 6 || text.length > 2400) return NextResponse.json({ error: 'Text must be 6-2400 characters' }, { status: 400 });
    const hash = revisionContentHash(text);
    if (hash !== item.contentHash) {
      const clash = await prisma.revisionItem.findFirst({ where: { chapterId: item.chapterId, contentHash: hash, id: { not: item.id } }, select: { id: true } });
      if (clash) return NextResponse.json({ error: 'Another item in this chapter already has this text' }, { status: 409 });
    }
    data.body = text;
    data.contentHash = hash;
    const run = await prisma.bookIngestionRun.findFirst({ where: { bookId: item.bookId }, orderBy: { createdAt: 'desc' }, select: { sourceDocumentId: true, draftPurgedAt: true } });
    if (run?.sourceDocumentId && !run.draftPurgedAt) {
      const page = await prisma.documentPage.findFirst({ where: { documentId: run.sourceDocumentId, pageNumber: item.sourcePage }, select: { rawText: true } });
      if (page?.rawText) data.verbatimScore = verbatimScore(text, page.rawText);
    }
  }

  const status = data.status as string | undefined;
  if (status === 'APPROVED' || status === 'ARCHIVED') {
    data.reviewedById = auth.user.id;
    data.reviewedAt = new Date();
  }

  const updated = await prisma.revisionItem.update({ where: { id: item.id }, data });
  await recordAuditLog({
    actorId: auth.user.id, actorRole: 'ADMIN', action: 'BOOK_REVISION_ITEM_REVIEWED', entityType: 'RevisionItem', entityId: item.id,
    metadata: { bookId: item.bookId, chapterId: item.chapterId, fromStatus: item.status, toStatus: updated.status, edited: body.body !== undefined || body.title !== undefined || body.kind !== undefined },
    ...requestAuditContext(request),
  });
  return NextResponse.json({ item: updated });
}
