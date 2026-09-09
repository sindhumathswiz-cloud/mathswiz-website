import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';

export async function POST(req: Request, { params }: { params: Promise<{ courseId: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id || session.user.role !== 'TEACHER') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { courseId } = await params;
  const course = await prisma.course.findFirst({ where: { id: courseId, createdById: session.user.id }, select: { id: true } });
  if (!course) return NextResponse.json({ error: 'Course not found' }, { status: 404 });
  const body = await req.json();
  const title = typeof body.title === 'string' ? body.title.trim() : '';
  if (title.length < 2 || title.length > 160) return NextResponse.json({ error: 'Module title must be 2–160 characters' }, { status: 400 });
  const module = await prisma.courseModule.create({ data: { courseId, title, description: typeof body.description === 'string' ? body.description.trim().slice(0, 2000) || null : null, orderIndex: Number.isInteger(body.orderIndex) ? Math.max(0, body.orderIndex) : 0 } });
  return NextResponse.json({ module }, { status: 201 });
}
