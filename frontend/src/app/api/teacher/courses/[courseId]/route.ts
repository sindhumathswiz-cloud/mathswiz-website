import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { recordAuditLog, requestAuditContext } from '@/lib/audit-log';

export async function PATCH(req: Request, { params }: { params: Promise<{ courseId: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id || session.user.role !== 'TEACHER') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { courseId } = await params;
  const existing = await prisma.course.findFirst({ where: { id: courseId, createdById: session.user.id }, select: { id: true } });
  if (!existing) return NextResponse.json({ error: 'Course not found' }, { status: 404 });
  const body = await req.json();
  const data: { title?: string; description?: string | null; isPublished?: boolean } = {};
  if (typeof body.title === 'string' && body.title.trim().length >= 3) data.title = body.title.trim().slice(0, 160);
  if (typeof body.description === 'string') data.description = body.description.trim().slice(0, 5000) || null;
  if (typeof body.isPublished === 'boolean') data.isPublished = body.isPublished;
  const course = await prisma.course.update({ where: { id: courseId }, data });
  await recordAuditLog({ actorId: session.user.id, actorRole: 'TEACHER', action: body.isPublished === true ? 'COURSE_PUBLISHED' : 'COURSE_UPDATED', entityType: 'Course', entityId: courseId, metadata: { changedFields: Object.keys(data) }, ...requestAuditContext(req) });
  return NextResponse.json({ course });
}
