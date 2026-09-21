import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';

export const dynamic = 'force-dynamic';

// Student-authored flashcards -- deliberately a separate path from
// GET /api/student/flashcards?folderId= (admin/teacher-curated content,
// read-only for students), so that route's contract stays untouched.
export async function GET(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id || session.user.role !== 'STUDENT') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const topic = searchParams.get('topic');
    const dueOnly = searchParams.get('mode') === 'due';

    if (!dueOnly) {
      const cards = await prisma.studentFlashcard.findMany({
        where: { userId: session.user.id, ...(topic ? { topic } : {}) },
        orderBy: { updatedAt: 'desc' },
      });
      return NextResponse.json({ cards });
    }

    // mode=due -- a card that's never been reviewed, or whose SM-2 schedule
    // says it's due, gets studied; a card not yet due stays hidden here
    // (still reachable via the unfiltered list above).
    const now = new Date();
    const allCards = await prisma.studentFlashcard.findMany({
      where: { userId: session.user.id, ...(topic ? { topic } : {}) },
      orderBy: { updatedAt: 'desc' },
      include: { spacedRepetitionCards: true },
    });
    const cards = allCards
      .filter((c) => {
        const schedule = c.spacedRepetitionCards[0];
        return !schedule || schedule.dueAt <= now;
      })
      .map(({ spacedRepetitionCards, ...card }) => card);

    return NextResponse.json({ cards });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to load flashcards' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id || session.user.role !== 'STUDENT') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json().catch(() => null);
    const front = typeof body?.front === 'string' ? body.front.trim() : '';
    const back = typeof body?.back === 'string' ? body.back.trim() : '';
    const topic = typeof body?.topic === 'string' && body.topic.trim() ? body.topic.trim() : undefined;
    if (!front || !back) {
      return NextResponse.json({ error: 'front and back are required' }, { status: 400 });
    }

    const card = await prisma.studentFlashcard.create({
      data: { userId: session.user.id, front, back, topic },
    });
    return NextResponse.json({ success: true, card });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to create flashcard' }, { status: 500 });
  }
}
