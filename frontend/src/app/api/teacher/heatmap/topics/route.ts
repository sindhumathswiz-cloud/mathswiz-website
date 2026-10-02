import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { sweepStaleMastery } from '@/lib/mastery';
import { requirePremiumTeacherStrict } from '@/lib/teacher-api-guard';

export const dynamic = 'force-dynamic';

// Weak-topic heatmap: average mastery per topic across a batch's approved
// students, weakest first. First groupBy in the teacher/ API surface --
// everything it needs (StudentProgress.masteryScore per topic) already
// exists, no new schema.
export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  const guard = await requirePremiumTeacherStrict(session);
  if (!guard.ok) return guard.response;

  const batchId = new URL(req.url).searchParams.get('batchId');
  if (!batchId) return NextResponse.json({ error: 'batchId is required' }, { status: 400 });

  const enrollments = await prisma.batchEnrollment.findMany({
    where: { status: 'APPROVED', batchId, batch: { teacherId: guard.userId } },
    select: { studentId: true },
  });
  if (enrollments.length === 0) return NextResponse.json({ topics: [] });
  const studentIds = [...new Set(enrollments.map((e) => e.studentId))];
  await sweepStaleMastery(prisma, studentIds);

  const grouped = await prisma.studentProgress.groupBy({
    by: ['topic'],
    where: { userId: { in: studentIds } },
    _avg: { masteryScore: true },
    _count: { _all: true },
  });

  const topics = grouped
    .map((g) => ({
      topic: g.topic,
      avgMastery: g._avg.masteryScore !== null ? Math.round(g._avg.masteryScore * 10) / 10 : 0,
      studentCount: g._count._all,
    }))
    .sort((a, b) => a.avgMastery - b.avgMastery);

  return NextResponse.json({ topics });
}
