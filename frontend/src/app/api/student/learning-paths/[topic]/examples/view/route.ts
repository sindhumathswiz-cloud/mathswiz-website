import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { nextStageAfterExamplesView } from '@/lib/learning-path';

export const dynamic = 'force-dynamic';

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
    const questionId = body?.questionId;
    if (typeof questionId !== 'string' || !questionId) {
      return NextResponse.json({ error: 'questionId is required' }, { status: 400 });
    }

    const existing = await prisma.learningPathProgress.findUnique({
      where: { userId_topic: { userId: studentId, topic } },
    });
    if (existing && existing.stage !== 'EXAMPLES') {
      return NextResponse.json({ error: 'This path is past the examples stage' }, { status: 400 });
    }

    const availableExamplesCount = await prisma.question.count({
      where: { topic, status: 'APPROVED', scope: 'PUBLIC', explanation: { not: null } },
    });

    const viewedIds = new Set(existing?.examplesViewedIds ?? []);
    viewedIds.add(questionId);
    const examplesViewedIds = Array.from(viewedIds);
    const examplesViewedCount = examplesViewedIds.length;

    const stage = nextStageAfterExamplesView('EXAMPLES', { examplesViewedCount, availableExamplesCount });

    const progress = await prisma.learningPathProgress.upsert({
      where: { userId_topic: { userId: studentId, topic } },
      update: { examplesViewedIds, examplesViewedCount, stage },
      create: { userId: studentId, topic, examplesViewedIds, examplesViewedCount, stage },
    });

    return NextResponse.json({ success: true, progress });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to record example view' }, { status: 500 });
  }
}
