import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { recordAuditLog, requestAuditContext } from '@/lib/audit-log';

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id || session.user.role !== 'TEACHER') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const courses = await prisma.course.findMany({ where: { createdById: session.user.id }, include: { modules: { include: { lessons: true }, orderBy: { orderIndex: 'asc' } }, _count: { select: { enrollments: true } } }, orderBy: { createdAt: 'desc' } });
  return NextResponse.json({ courses });
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id || session.user.role !== 'TEACHER') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const body = await req.json();
  const title = typeof body.title === 'string' ? body.title.trim() : '';
  if (title.length < 3 || title.length > 160) return NextResponse.json({ error: 'Course title must be 3–160 characters' }, { status: 400 });
  const course = await prisma.course.create({ data: { title, description: typeof body.description === 'string' ? body.description.trim().slice(0, 5000) || null : null, class: typeof body.class === 'string' ? body.class.trim().slice(0, 100) || null : null, subject: typeof body.subject === 'string' ? body.subject.trim().slice(0, 100) || null : null, createdById: session.user.id } });
  await recordAuditLog({ actorId: session.user.id, actorRole: 'TEACHER', action: 'COURSE_CREATED', entityType: 'Course', entityId: course.id, ...requestAuditContext(req) });
  return NextResponse.json({ course }, { status: 201 });
}
