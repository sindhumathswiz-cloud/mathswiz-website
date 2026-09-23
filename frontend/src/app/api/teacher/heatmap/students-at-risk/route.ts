import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { sweepStaleMastery } from '@/lib/mastery';

export const dynamic = 'force-dynamic';

// Reuses the same masteryScore < 40 threshold already established in
// /api/teacher/interventions, but aggregated per student across a batch
// rather than returned as flat per-topic rows.
export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id || session.user.role !== 'TEACHER') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const batchId = new URL(req.url).searchParams.get('batchId');
  if (!batchId) return NextResponse.json({ error: 'batchId is required' }, { status: 400 });

  const enrollments = await prisma.batchEnrollment.findMany({
    where: { status: 'APPROVED', batchId, batch: { teacherId: session.user.id } },
    select: { studentId: true, student: { select: { id: true, firstName: true, lastName: true } } },
  });
  if (enrollments.length === 0) return NextResponse.json({ students: [] });
  const studentIds = [...new Set(enrollments.map((e) => e.studentId))];
  const studentById = new Map(enrollments.map((e) => [e.studentId, e.student]));
  await sweepStaleMastery(prisma, studentIds);

  const weakProgress = await prisma.studentProgress.findMany({
    where: { userId: { in: studentIds }, masteryScore: { lt: 40 } },
    select: { userId: true, masteryScore: true },
  });

  const byStudent = new Map<string, number[]>();
  for (const row of weakProgress) {
    const list = byStudent.get(row.userId) ?? [];
    list.push(row.masteryScore);
    byStudent.set(row.userId, list);
  }

  const students = Array.from(byStudent.entries())
    .map(([userId, scores]) => ({
      ...studentById.get(userId)!,
      weakTopicCount: scores.length,
      avgMasteryAcrossWeakTopics: Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 10) / 10,
    }))
    .sort((a, b) => a.avgMasteryAcrossWeakTopics - b.avgMasteryAcrossWeakTopics);

  return NextResponse.json({ students });
}
