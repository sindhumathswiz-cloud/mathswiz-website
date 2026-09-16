import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id || session.user.role !== 'STUDENT') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const { id } = await params;

    const card = await prisma.studentFlashcard.findUnique({ where: { id } });
    if (!card || card.userId !== session.user.id) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    const body = await request.json().catch(() => null);
    const data: { front?: string; back?: string; topic?: string | null } = {};
    if (typeof body?.front === 'string' && body.front.trim()) data.front = body.front.trim();
    if (typeof body?.back === 'string' && body.back.trim()) data.back = body.back.trim();
    if (typeof body?.topic === 'string') data.topic = body.topic.trim() || null;

    const updated = await prisma.studentFlashcard.update({ where: { id }, data });
    return NextResponse.json({ success: true, card: updated });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to update flashcard' }, { status: 500 });
  }
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id || session.user.role !== 'STUDENT') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const { id } = await params;

    const card = await prisma.studentFlashcard.findUnique({ where: { id } });
    if (!card || card.userId !== session.user.id) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    await prisma.studentFlashcard.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to delete flashcard' }, { status: 500 });
  }
}
