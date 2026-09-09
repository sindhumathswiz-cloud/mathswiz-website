import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';

export async function PATCH(req: Request, { params }: { params: Promise<{ courseId: string; lessonId: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id || session.user.role !== 'STUDENT') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { courseId, lessonId } = await params;
  const enrollment = await prisma.courseEnrollment.findFirst({
    where: { courseId, studentId: session.user.id, status: 'ACTIVE', course: { isPublished: true, modules: { some: { lessons: { some: { id: lessonId, isPublished: true } } } } } },
    select: { id: true },
  });
  if (!enrollment) return NextResponse.json({ error: 'Course or lesson not available' }, { status: 404 });
  const body = await req.json();
  const completed = body.completed === true;
  const progress = await prisma.lessonProgress.upsert({
    where: { enrollmentId_lessonId: { enrollmentId: enrollment.id, lessonId } },
    create: { enrollmentId: enrollment.id, lessonId, completed, completedAt: completed ? new Date() : null },
    update: { completed, completedAt: completed ? new Date() : null, lastAccessedAt: new Date() },
  });
  return NextResponse.json({ progress });
}
