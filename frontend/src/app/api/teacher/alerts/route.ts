import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { computeAlerts } from '@/lib/alerts';

export const dynamic = 'force-dynamic';

const WINDOW_DAYS = 7;

// Batch-scoped variant of api/parent/alerts/route.ts, reusing the same
// lib/alerts.ts signals across every student in a teacher's own batch
// rather than one linked child.
export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id || session.user.role !== 'TEACHER') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const batchId = new URL(req.url).searchParams.get('batchId');
  if (!batchId) return NextResponse.json({ error: 'batchId is required' }, { status: 400 });

  const enrollments = await prisma.batchEnrollment.findMany({
    where: { status: 'APPROVED', batchId, batch: { teacherId: session.user.id } },
    select: { studentId: true, student: { select: { id: true, firstName: true, lastName: true, lastActiveAt: true, class: true } } },
  });
  if (enrollments.length === 0) return NextResponse.json({ students: [] });
  const studentIds = [...new Set(enrollments.map((e) => e.studentId))];

  const now = new Date();
  const windowEnd = new Date(now.getTime() + WINDOW_DAYS * 24 * 60 * 60 * 1000);

  const [progressRows, assignments] = await Promise.all([
    prisma.studentProgress.findMany({ where: { userId: { in: studentIds } }, select: { userId: true, topic: true, masteryScore: true } }),
    prisma.testAssignment.findMany({
      where: { batchId, deadline: { lte: windowEnd } },
      select: { deadline: true, test: { select: { title: true } } },
    }),
  ]);

  const progressByStudent = new Map<string, { topic: string; masteryScore: number }[]>();
  for (const row of progressRows) {
    const list = progressByStudent.get(row.userId) ?? [];
    list.push({ topic: row.topic, masteryScore: row.masteryScore });
    progressByStudent.set(row.userId, list);
  }
  const assignmentRows = assignments
    .filter((a): a is typeof a & { deadline: Date } => a.deadline != null)
    .map((a) => ({ id: a.test?.title || 'Assessment', title: a.test?.title || 'Assessment', deadline: a.deadline }));

  const students = enrollments
    .map((e) => ({
      ...e.student,
      alerts: computeAlerts({
        lastActiveAt: e.student.lastActiveAt,
        progressRows: progressByStudent.get(e.studentId) ?? [],
        assignments: assignmentRows,
        now,
      }),
    }))
    .filter((s) => s.alerts.length > 0);

  return NextResponse.json({ students });
}
