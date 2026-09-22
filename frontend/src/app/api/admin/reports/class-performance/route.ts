import { NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/auth-server';
import prisma from '@/lib/prisma';
import { masterySummary, masteryBand, type MasteryTopic } from '@/lib/mastery-view';

export const dynamic = 'force-dynamic';

/**
 * Admin-wide version of api/teacher/heatmap/{topics,students-at-risk} --
 * same masteryBand/masterySummary thresholds, grouped by batch instead of
 * scoped to one teacher-owned batch. No admin-wide equivalent existed
 * before this (confirmed).
 */
export async function GET() {
  const auth = await getAuthenticatedUser(['ADMIN']);
  if ('error' in auth) return auth.error;

  const batches = await prisma.batch.findMany({
    select: { id: true, name: true, class: true, teacher: { select: { firstName: true, lastName: true } } },
  });

  const enrollments = await prisma.batchEnrollment.findMany({
    where: { status: 'APPROVED' },
    select: { batchId: true, studentId: true },
  });
  const studentIds = [...new Set(enrollments.map((e) => e.studentId))];

  const progress = studentIds.length > 0
    ? await prisma.studentProgress.findMany({
        where: { userId: { in: studentIds } },
        select: { userId: true, topic: true, masteryScore: true },
      })
    : [];

  const progressByStudent = new Map<string, MasteryTopic[]>();
  for (const p of progress) {
    const list = progressByStudent.get(p.userId) ?? [];
    list.push({ topic: p.topic, masteryScore: p.masteryScore });
    progressByStudent.set(p.userId, list);
  }

  const studentsByBatch = new Map<string, Set<string>>();
  for (const e of enrollments) {
    const set = studentsByBatch.get(e.batchId) ?? new Set<string>();
    set.add(e.studentId);
    studentsByBatch.set(e.batchId, set);
  }

  const classPerformance = batches
    .map((batch) => {
      const studentIdsInBatch = [...(studentsByBatch.get(batch.id) ?? [])];
      const allTopicRows = studentIdsInBatch.flatMap((id) => progressByStudent.get(id) ?? []);
      const atRiskStudentCount = studentIdsInBatch.filter((id) =>
        (progressByStudent.get(id) ?? []).some((p) => masteryBand(p.masteryScore) === 'needs_support')
      ).length;

      return {
        batchId: batch.id,
        batchName: batch.name,
        className: batch.class,
        teacherName: `${batch.teacher.firstName || ''} ${batch.teacher.lastName || ''}`.trim(),
        studentCount: studentIdsInBatch.length,
        avgMastery: masterySummary(allTopicRows).average,
        atRiskStudentCount,
      };
    })
    .filter((b) => b.studentCount > 0)
    .sort((a, b) => a.avgMastery - b.avgMastery);

  return NextResponse.json({ classPerformance });
}
