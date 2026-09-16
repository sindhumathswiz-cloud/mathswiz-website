import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id || session.user.role !== 'STUDENT') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const { id } = await params;

    const list = await prisma.bookmarkList.findUnique({ where: { id } });
    if (!list || list.userId !== session.user.id) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    const items = await prisma.bookmarkItem.findMany({
      where: { listId: id },
      include: { question: { select: { id: true, content: true, topic: true, subject: true, difficulty: true } } },
      orderBy: { createdAt: 'desc' },
    });

    return NextResponse.json({ list, items });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to load list items' }, { status: 500 });
  }
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id || session.user.role !== 'STUDENT') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const { id } = await params;

    const list = await prisma.bookmarkList.findUnique({ where: { id } });
    if (!list || list.userId !== session.user.id) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

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

    const item = await prisma.bookmarkItem.upsert({
      where: { listId_questionId: { listId: id, questionId } },
      update: note !== undefined ? { note } : {},
      create: { listId: id, questionId, note },
    });
    await prisma.bookmarkList.update({ where: { id }, data: { updatedAt: new Date() } });

    return NextResponse.json({ success: true, item });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to add bookmark' }, { status: 500 });
  }
}
