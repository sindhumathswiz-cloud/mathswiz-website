import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { computeAlerts } from '@/lib/alerts';
import { buildActionCards } from '@/lib/parent-action-cards';

export const dynamic = 'force-dynamic';

const WINDOW_DAYS = 7;

/**
 * Separate route from api/parent/dashboard so the dashboard's main payload
 * isn't blocked on this computation. Duplicates the alert/comment queries
 * from api/parent/alerts and api/parent/dashboard rather than making an
 * HTTP call to either -- same data, fetched directly.
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

    const [student, progressRows, enrollments, responseComments, interventionComments] = await Promise.all([
      prisma.user.findUnique({ where: { id: studentId }, select: { lastActiveAt: true, class: true } }),
      prisma.studentProgress.findMany({ where: { userId: studentId }, select: { topic: true, masteryScore: true } }),
      prisma.batchEnrollment.findMany({ where: { studentId, status: 'APPROVED' }, select: { batchId: true } }),
      prisma.testResponse.findMany({
        where: { attempt: { userId: studentId }, teacherFeedback: { not: null } },
        select: { teacherFeedback: true, reviewedAt: true, attempt: { select: { test: { select: { title: true } } } } },
        orderBy: { reviewedAt: 'desc' },
        take: 5,
      }),
      prisma.intervention.findMany({
        where: { studentId, outcomeNotes: { not: null } },
        select: { title: true, outcomeNotes: true, updatedAt: true },
        orderBy: { updatedAt: 'desc' },
        take: 5,
      }),
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

    const teacherComments = [
      ...responseComments.map((r) => ({ title: r.attempt.test?.title || 'Test response', comment: r.teacherFeedback!, at: r.reviewedAt })),
      ...interventionComments.map((iv) => ({ title: iv.title, comment: iv.outcomeNotes!, at: iv.updatedAt })),
    ].sort((a, b) => new Date(b.at ?? 0).getTime() - new Date(a.at ?? 0).getTime());

    const cards = buildActionCards({ alerts, teacherComments });

    return NextResponse.json({ cards });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to load action cards' }, { status: 500 });
  }
}
