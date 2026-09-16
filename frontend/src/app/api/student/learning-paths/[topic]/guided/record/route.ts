import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { hasReachedStage, nextStageAfterGuidedRecord } from '@/lib/learning-path';

export const dynamic = 'force-dynamic';

// Called by the client alongside (not instead of) the existing
// /api/student/practice/submit call during this path's guided-practice
// stage. This route only tracks the path's own gate bookkeeping -- it never
// writes mastery/points, practice/submit remains the single writer for those.
export async function POST(request: Request, { params }: { params: Promise<{ topic: string }> }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id || session.user.role !== 'STUDENT') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const studentId = session.user.id;
    const { topic: topicParam } = await params;
    const topic = decodeURIComponent(topicParam);

    const body = await request.json().catch(() => null);
    if (typeof body?.isCorrect !== 'boolean') {
      return NextResponse.json({ error: 'isCorrect (boolean) is required' }, { status: 400 });
    }

    const existing = await prisma.learningPathProgress.findUnique({
      where: { userId_topic: { userId: studentId, topic } },
    });
    if (!existing || !hasReachedStage(existing.stage, 'GUIDED_PRACTICE')) {
      return NextResponse.json({ error: 'This path has not reached guided practice yet' }, { status: 400 });
    }
    if (existing.stage !== 'GUIDED_PRACTICE') {
      // Already past this stage -- no-op rather than an error, since a
      // stray late-arriving record shouldn't break the UI.
      return NextResponse.json({ success: true, progress: existing });
    }

    const guidedAttempted = existing.guidedAttempted + 1;
    const guidedCorrect = existing.guidedCorrect + (body.isCorrect ? 1 : 0);
    const stage = nextStageAfterGuidedRecord('GUIDED_PRACTICE', { guidedAttempted, guidedCorrect });

    const progress = await prisma.learningPathProgress.update({
      where: { userId_topic: { userId: studentId, topic } },
      data: { guidedAttempted, guidedCorrect, stage },
    });

    return NextResponse.json({ success: true, progress });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to record guided practice attempt' }, { status: 500 });
  }
}
