import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { recordAuditLog, requestAuditContext } from '@/lib/audit-log';

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id || session.user.role !== 'TEACHER') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await params;
  const existing = await prisma.intervention.findFirst({ where: { id, teacherId: session.user.id }, select: { id: true, studentId: true } });
  if (!existing) return NextResponse.json({ error: 'Intervention not found' }, { status: 404 });
  const body = await req.json();
  const allowed = ['ASSIGNED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'] as const;
  if (!allowed.includes(body.status)) return NextResponse.json({ error: 'Invalid status' }, { status: 400 });
  const outcomeNotes = typeof body.outcomeNotes === 'string' ? body.outcomeNotes.trim().slice(0, 10_000) || null : null;
  const updated = await prisma.$transaction(async (tx) => {
    const row = await tx.intervention.update({ where: { id }, data: { status: body.status, outcomeNotes, completedAt: body.status === 'COMPLETED' ? new Date() : null } });
    await tx.notification.create({ data: { userId: existing.studentId, title: 'Learning support updated', message: `Your intervention status is now ${body.status.replace('_', ' ').toLowerCase()}.`, type: 'INTERVENTION', targetRole: 'STUDENT' } });
    return row;
  });
  await recordAuditLog({ actorId: session.user.id, actorRole: 'TEACHER', action: 'INTERVENTION_UPDATED', entityType: 'Intervention', entityId: id, metadata: { status: body.status }, ...requestAuditContext(req) });
  return NextResponse.json({ intervention: updated });
}
