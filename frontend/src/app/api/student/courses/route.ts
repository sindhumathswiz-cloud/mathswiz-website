import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id || session.user.role !== 'STUDENT') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const enrollments = await prisma.courseEnrollment.findMany({
    where: { studentId: session.user.id, status: { in: ['ACTIVE', 'COMPLETED'] }, course: { isPublished: true } },
    include: {
      progress: true,
      course: { include: { modules: { orderBy: { orderIndex: 'asc' }, include: { lessons: { where: { isPublished: true }, orderBy: { orderIndex: 'asc' } } } } } },
    },
    orderBy: { enrolledAt: 'desc' },
  });
  return NextResponse.json({ enrollments });
}
