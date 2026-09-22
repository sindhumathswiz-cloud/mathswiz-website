import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { computeAlerts } from '@/lib/alerts';

export const dynamic = 'force-dynamic';

const WINDOW_DAYS = 7;

/**
 * Computed fresh on every request -- no cron/notification infra exists
 * anywhere in this codebase (confirmed), matching the same on-demand
 * pattern as api/student/planner/route.ts.
 */
export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id || session.user.role !== 'PARENT') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const studentId = searchParams.get('studentId');
  if (!studentId) return NextResponse.json({ error: 'studentId is required' }, { status: 400 });

  const link = await prisma.parentLink.findFirst({ where: { parentId: session.user.id, studentId } });
  if (!link) return NextResponse.json({ error: 'Student not linked to this account' }, { status: 403 });

  try {
    const now = new Date();
    const windowEnd = new Date(now.getTime() + WINDOW_DAYS * 24 * 60 * 60 * 1000);

    const [student, progressRows, enrollments] = await Promise.all([
      prisma.user.findUnique({ where: { id: studentId }, select: { lastActiveAt: true, class: true } }),
      prisma.studentProgress.findMany({ where: { userId: studentId }, select: { topic: true, masteryScore: true } }),
      prisma.batchEnrollment.findMany({ where: { studentId, status: 'APPROVED' }, select: { batchId: true } }),
    ]);

    const batchIds = enrollments.map((e) => e.batchId);
    const assignments = await prisma.testAssignment.findMany({
      where: {
        OR: [{ batchId: { in: batchIds } }, { studentId }],
        test: { OR: [{ class: student?.class ?? undefined }, { class: null }] },
        deadline: { lte: windowEnd },
      },
      select: { id: true, deadline: true, test: { select: { title: true } } },
    });

    const alerts = computeAlerts({
      lastActiveAt: student?.lastActiveAt,
      progressRows,
      assignments: assignments
        .filter((a): a is typeof a & { deadline: Date } => a.deadline != null)
        .map((a) => ({ id: a.id, title: a.test?.title || 'Assessment', deadline: a.deadline })),
      now,
    });

    return NextResponse.json({ alerts });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to load alerts' }, { status: 500 });
  }
}
