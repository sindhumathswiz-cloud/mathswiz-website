import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { mistakesFromCards } from '@/lib/mistake-queue';

export const dynamic = 'force-dynamic';

/**
 * The "My Mistakes" notebook: a standalone browsable list merging two
 * sources -- questions the student has a persisted SM-2 review card for
 * (see lib/spaced-repetition.ts, mistakesFromCards() converts to this
 * route's shape; the same source the passive review nudge uses, see
 * /api/student/practice/mistakes) and questions the student explicitly
 * pinned via MistakeNotebookEntry, independent of whether they ever got it
 * wrong. A question present in both is reported once with source: 'both'.
 */
export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id || session.user.role !== 'STUDENT') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const studentId = session.user.id;

    const [cards, flagged] = await Promise.all([
      prisma.spacedRepetitionCard.findMany({
        where: { userId: studentId, questionId: { not: null } },
        select: { questionId: true, lapses: true, lastReviewedAt: true, createdAt: true, dueAt: true },
      }),
      prisma.mistakeNotebookEntry.findMany({
        where: { userId: studentId },
        orderBy: { createdAt: 'desc' },
      }),
    ]);

    const autoMistakes = mistakesFromCards(cards as { questionId: string; lapses: number; lastReviewedAt: Date | null; createdAt: Date; dueAt: Date }[]);
    const autoById = new Map(autoMistakes.map((e) => [e.questionId, e]));
    const flaggedById = new Map(flagged.map((e) => [e.questionId, e]));

    const questionIds = Array.from(new Set([...autoById.keys(), ...flaggedById.keys()]));
    if (questionIds.length === 0) {
      return NextResponse.json({ entries: [] });
    }

    const questions = await prisma.question.findMany({
      where: { id: { in: questionIds }, status: { in: ['APPROVED', 'PENDING_REVIEW'] }, scope: 'PUBLIC' },
      select: { id: true, content: true, topic: true, subject: true, difficulty: true },
    });
    const questionById = new Map(questions.map((q) => [q.id, q]));

    const entries = questionIds.flatMap((questionId) => {
      const question = questionById.get(questionId);
      if (!question) return [];
      const auto = autoById.get(questionId);
      const flag = flaggedById.get(questionId);
      const source = auto && flag ? 'both' : auto ? 'auto' : 'flagged';
      return [{
        questionId,
        question,
        source,
        missCount: auto?.missCount ?? null,
        dueAt: auto?.dueAt.toISOString() ?? null,
        flaggedEntryId: flag?.id ?? null,
        flaggedAt: flag?.createdAt.toISOString() ?? null,
        note: flag?.note ?? null,
      }];
    });

    // Due-soonest first (auto mistakes), then most-recently-flagged, then
    // the rest -- so a student opening the notebook sees what needs
    // attention first.
    entries.sort((a, b) => {
      if (a.dueAt && b.dueAt) return new Date(a.dueAt).getTime() - new Date(b.dueAt).getTime();
      if (a.dueAt) return -1;
      if (b.dueAt) return 1;
      if (a.flaggedAt && b.flaggedAt) return new Date(b.flaggedAt).getTime() - new Date(a.flaggedAt).getTime();
      return 0;
    });

    return NextResponse.json({ entries });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to load mistakes notebook' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id || session.user.role !== 'STUDENT') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const studentId = session.user.id;

    const body = await request.json().catch(() => null);
    const questionId = body?.questionId;
    const note = typeof body?.note === 'string' ? body.note.slice(0, 500) : undefined;
    if (typeof questionId !== 'string' || !questionId) {
      return NextResponse.json({ error: 'questionId is required' }, { status: 400 });
    }

    const question = await prisma.question.findFirst({
      where: { id: questionId, status: { in: ['APPROVED', 'PENDING_REVIEW'] }, scope: 'PUBLIC' },
      select: { id: true },
    });
    if (!question) {
      return NextResponse.json({ error: 'Question not found or unavailable' }, { status: 404 });
    }

    const entry = await prisma.mistakeNotebookEntry.upsert({
      where: { userId_questionId: { userId: studentId, questionId } },
      update: note !== undefined ? { note } : {},
      create: { userId: studentId, questionId, note },
    });

    return NextResponse.json({ success: true, entry });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to flag question' }, { status: 500 });
  }
}
