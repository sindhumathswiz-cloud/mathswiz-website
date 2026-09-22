import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getAuthenticatedUser } from '@/lib/auth-server';
import { recordAuditLog, requestAuditContext } from '@/lib/audit-log';

/**
 * Marks a flagged review-queue row as resolved: a human has fixed the
 * underlying issue (elsewhere, by directly editing the question) and is
 * clearing the flag rather than archiving the row. Strips the review-flag
 * tags so it drops out of the queue, and records who resolved it and when
 * in reviewNotes -- never destructive, matches the "preserve history" rule
 * every other second-review write in this codebase follows.
 */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await getAuthenticatedUser(['ADMIN']);
  if ('error' in auth) return auth.error;
  const { id } = await params;

  const body = await request.json().catch(() => ({}));
  if (body.action !== 'resolve') return NextResponse.json({ error: 'action must be "resolve"' }, { status: 400 });

  const question = await prisma.question.findUnique({ where: { id }, select: { tags: true, reviewNotes: true } });
  if (!question) return NextResponse.json({ error: 'Question not found' }, { status: 404 });

  const note = [
    `[Resolved -- ${new Date().toISOString().slice(0, 10)} by ${auth.user.email ?? auth.user.id}]`,
    body.note ? String(body.note).slice(0, 2000) : 'Flag cleared after manual confirmation.',
  ].join('\n');

  const nextTags = question.tags.filter((t) => t !== 'Second-Review: Flagged' && t !== 'AI-Verified: Flagged' && t !== 'Gate-Swept: Flagged');

  const updated = await prisma.question.update({
    where: { id },
    data: {
      tags: nextTags,
      verificationStatus: 'VERIFIED',
      reviewNotes: question.reviewNotes ? `${question.reviewNotes}\n\n${note}` : note,
    },
    select: { id: true, verificationStatus: true, tags: true, reviewNotes: true },
  });

  await recordAuditLog({
    actorId: auth.user.id,
    actorRole: 'ADMIN',
    action: 'QUESTION_REVIEW_RESOLVED',
    entityType: 'Question',
    entityId: id,
    metadata: { note: body.note ?? null },
    ...requestAuditContext(request),
  });

  return NextResponse.json({ question: updated });
}
