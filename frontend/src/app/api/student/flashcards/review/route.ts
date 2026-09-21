import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { computeNextReview, DEFAULT_SM2_STATE, GRADE_QUALITY, type SM2Grade } from '@/lib/spaced-repetition';

export const dynamic = 'force-dynamic';

// Grades a single flashcard review and reschedules it via SM-2. Flashcards
// have no objective correct/incorrect signal to derive a grade from (unlike
// questions), so this is the one place a real self-report UI is necessary.
export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id || session.user.role !== 'STUDENT') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const userId = session.user.id;

    const body = await request.json().catch(() => null);
    const flashcardId = typeof body?.flashcardId === 'string' ? body.flashcardId : '';
    const grade = typeof body?.grade === 'string' ? body.grade as SM2Grade : undefined;
    if (!flashcardId || !grade || !(grade in GRADE_QUALITY)) {
      return NextResponse.json({ error: 'flashcardId and a valid grade are required' }, { status: 400 });
    }

    const flashcard = await prisma.studentFlashcard.findFirst({ where: { id: flashcardId, userId }, select: { id: true } });
    if (!flashcard) {
      return NextResponse.json({ error: 'Flashcard not found' }, { status: 404 });
    }

    const existing = await prisma.spacedRepetitionCard.findUnique({
      where: { userId_flashcardId: { userId, flashcardId } },
    });
    const quality = GRADE_QUALITY[grade];
    const now = new Date();
    const next = computeNextReview(existing ?? DEFAULT_SM2_STATE, quality, now);

    const card = await prisma.spacedRepetitionCard.upsert({
      where: { userId_flashcardId: { userId, flashcardId } },
      create: {
        userId,
        flashcardId,
        easinessFactor: next.easinessFactor,
        intervalDays: next.intervalDays,
        repetitions: next.repetitions,
        lapses: quality < 3 ? 1 : 0,
        dueAt: next.dueAt,
        lastReviewedAt: now,
      },
      update: {
        easinessFactor: next.easinessFactor,
        intervalDays: next.intervalDays,
        repetitions: next.repetitions,
        lapses: quality < 3 ? (existing?.lapses ?? 0) + 1 : existing?.lapses ?? 0,
        dueAt: next.dueAt,
        lastReviewedAt: now,
      },
    });

    return NextResponse.json({ success: true, card });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to record flashcard review' }, { status: 500 });
  }
}
