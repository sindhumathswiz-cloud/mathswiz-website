import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';

export async function POST(req: Request, { params }: { params: Promise<{ courseId: string; moduleId: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id || session.user.role !== 'TEACHER') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { courseId, moduleId } = await params;
  const module = await prisma.courseModule.findFirst({ where: { id: moduleId, courseId, course: { createdById: session.user.id } }, select: { id: true } });
  if (!module) return NextResponse.json({ error: 'Module not found' }, { status: 404 });
  const body = await req.json();
  const title = typeof body.title === 'string' ? body.title.trim() : '';
  if (title.length < 2 || title.length > 160) return NextResponse.json({ error: 'Lesson title must be 2–160 characters' }, { status: 400 });
  const lesson = await prisma.courseLesson.create({ data: { moduleId, title, content: typeof body.content === 'string' ? body.content.trim().slice(0, 100_000) || null : null, contentUrl: typeof body.contentUrl === 'string' ? body.contentUrl.trim().slice(0, 2000) || null : null, orderIndex: Number.isInteger(body.orderIndex) ? Math.max(0, body.orderIndex) : 0, estimatedMinutes: Number.isInteger(body.estimatedMinutes) ? Math.max(1, Math.min(body.estimatedMinutes, 1440)) : null, isPublished: body.isPublished === true } });
  return NextResponse.json({ lesson }, { status: 201 });
}
