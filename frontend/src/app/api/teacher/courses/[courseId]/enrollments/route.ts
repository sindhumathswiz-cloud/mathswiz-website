import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { recordAuditLog, requestAuditContext } from '@/lib/audit-log';

export async function POST(req: Request, { params }: { params: Promise<{ courseId: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id || session.user.role !== 'TEACHER') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { courseId } = await params;
  const body = await req.json();
  const studentId = typeof body.studentId === 'string' ? body.studentId : '';
  const [course, enrollment] = await Promise.all([
    prisma.course.findFirst({ where: { id: courseId, createdById: session.user.id }, select: { id: true } }),
    prisma.batchEnrollment.findFirst({ where: { studentId, status: 'APPROVED', batch: { teacherId: session.user.id } }, select: { id: true } }),
  ]);
  if (!course || !enrollment) return NextResponse.json({ error: 'Course or eligible student not found' }, { status: 404 });
  const created = await prisma.courseEnrollment.upsert({ where: { courseId_studentId: { courseId, studentId } }, create: { courseId, studentId }, update: { status: 'ACTIVE', completedAt: null } });
  await recordAuditLog({ actorId: session.user.id, actorRole: 'TEACHER', action: 'STUDENT_ENROLLED_IN_COURSE', entityType: 'CourseEnrollment', entityId: created.id, metadata: { courseId, studentId }, ...requestAuditContext(req) });
  return NextResponse.json({ enrollment: created }, { status: 201 });
}
