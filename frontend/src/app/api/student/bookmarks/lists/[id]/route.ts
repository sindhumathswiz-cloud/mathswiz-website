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

    const list = await prisma.bookmarkList.findUnique({ where: { id } });
    if (!list || list.userId !== session.user.id) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    const body = await request.json().catch(() => null);
    const data: { name?: string; description?: string | null } = {};
    if (typeof body?.name === 'string' && body.name.trim()) data.name = body.name.trim();
    if (typeof body?.description === 'string') data.description = body.description.trim() || null;

    const updated = await prisma.bookmarkList.update({ where: { id }, data });
    return NextResponse.json({ success: true, list: updated });
  } catch (error: any) {
    if (error?.code === 'P2002') {
      return NextResponse.json({ error: 'You already have a list with this name' }, { status: 409 });
    }
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to update list' }, { status: 500 });
  }
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
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

    await prisma.bookmarkList.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to delete list' }, { status: 500 });
  }
}
