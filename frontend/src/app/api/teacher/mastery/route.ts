import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { sweepStaleMastery } from '@/lib/mastery';
import { isPremiumSubscription } from '@/lib/subscription';

export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id || session.user.role !== 'TEACHER') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const caller = await prisma.user.findUnique({ where: { id: session.user.id }, select: { subscription: true } });
  if (!isPremiumSubscription(caller?.subscription)) {
    return NextResponse.json({ error: 'This feature requires a premium subscription.' }, { status: 403 });
  }
  const url = new URL(req.url);
  const batchId = url.searchParams.get('batchId');
  const studentId = url.searchParams.get('studentId');
  if (!batchId && !studentId) return NextResponse.json({ error: 'batchId or studentId is required' }, { status: 400 });

  const enrollments = await prisma.batchEnrollment.findMany({
    where: {
      status: 'APPROVED',
      batch: { teacherId: session.user.id },
      ...(batchId ? { batchId } : {}),
      ...(studentId ? { studentId } : {}),
    },
    select: { studentId: true, student: { select: { id: true, firstName: true, lastName: true } } },
  });
  if (enrollments.length === 0) return NextResponse.json({ error: 'No authorized students found' }, { status: 404 });
  const studentIds = [...new Set(enrollments.map((item) => item.studentId))];
  await sweepStaleMastery(prisma, studentIds);
  const progress = await prisma.studentProgress.findMany({ where: { userId: { in: studentIds } }, orderBy: [{ userId: 'asc' }, { masteryScore: 'asc' }] });
  return NextResponse.json({ students: enrollments.map((item) => item.student), progress });
}
