import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { bucketByDay, type PlannerItem } from '@/lib/planner';

export const dynamic = 'force-dynamic';

const WINDOW_DAYS = 7;

function truncate(text: string, max = 70): string {
  const trimmed = text.trim();
  return trimmed.length > max ? `${trimmed.slice(0, max - 1)}…` : trimmed;
}

/**
 * Aggregates everything a student has due this week -- SM-2-due question
 * and flashcard reviews, test/homework deadlines, and teacher-assigned
 * interventions -- into one day-bucketed view. Computed fresh on every
 * request, matching the rest of the codebase (no cron/background job
 * infrastructure exists anywhere here).
 */
export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id || session.user.role !== 'STUDENT') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const userId = session.user.id;
    const studentClass = (session.user as any).class;

    const now = new Date();
    const endOfWeek = new Date(now.getTime() + WINDOW_DAYS * 24 * 60 * 60 * 1000);

    const [questionCards, flashcardCards, enrollments, interventions] = await Promise.all([
      prisma.spacedRepetitionCard.findMany({
        where: { userId, questionId: { not: null }, dueAt: { lte: endOfWeek } },
        include: { question: { select: { id: true, content: true } } },
      }),
      prisma.spacedRepetitionCard.findMany({
        where: { userId, flashcardId: { not: null }, dueAt: { lte: endOfWeek } },
        include: { flashcard: { select: { id: true, front: true } } },
      }),
      prisma.batchEnrollment.findMany({ where: { studentId: userId, status: 'APPROVED' }, select: { batchId: true } }),
      prisma.intervention.findMany({
        where: { studentId: userId, status: { in: ['ASSIGNED', 'IN_PROGRESS'] }, dueDate: { lte: endOfWeek } },
        select: { id: true, title: true, dueDate: true },
      }),
    ]);

    const batchIds = enrollments.map((e) => e.batchId);
    const assignments = await prisma.testAssignment.findMany({
      where: {
        OR: [{ batchId: { in: batchIds } }, { studentId: userId }],
        test: { OR: [{ class: studentClass }, { class: null }] },
        deadline: { lte: endOfWeek },
      },
      include: { test: { include: { attempts: { where: { userId, status: 'SUBMITTED' } } } } },
    });

    const items: PlannerItem[] = [];

    for (const card of questionCards) {
      if (!card.question) continue;
      items.push({
        id: card.id,
        type: 'QUESTION_REVIEW',
        title: truncate(card.question.content),
        date: card.dueAt,
        href: '/student/practice?mode=mistakes',
      });
    }

    for (const card of flashcardCards) {
      if (!card.flashcard) continue;
      items.push({
        id: card.id,
        type: 'FLASHCARD_REVIEW',
        title: truncate(card.flashcard.front),
        date: card.dueAt,
        href: '/student/flashcards/study?mode=due',
      });
    }

    for (const assignment of assignments) {
      if (!assignment.deadline) continue;
      const attemptsUsed = assignment.test?.attempts?.length ?? 0;
      if (attemptsUsed >= (assignment.maxAttempts || 1)) continue; // already completed, not a pending task
      items.push({
        id: assignment.id,
        type: 'TEST',
        title: assignment.test?.title || 'Untitled test',
        date: assignment.deadline,
        href: '/student/tests',
      });
    }

    for (const intervention of interventions) {
      if (!intervention.dueDate) continue;
      items.push({
        id: intervention.id,
        type: 'INTERVENTION',
        title: intervention.title,
        date: intervention.dueDate,
        href: '/student/interventions',
      });
    }

    return NextResponse.json({ buckets: bucketByDay(items, now) });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to load planner' }, { status: 500 });
  }
}
