import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id || session.user.role !== 'STUDENT') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const lists = await prisma.bookmarkList.findMany({
      where: { userId: session.user.id },
      include: { _count: { select: { items: true } } },
      orderBy: { updatedAt: 'desc' },
    });

    return NextResponse.json({ lists });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to load bookmark lists' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id || session.user.role !== 'STUDENT') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json().catch(() => null);
    const name = typeof body?.name === 'string' ? body.name.trim() : '';
    const description = typeof body?.description === 'string' ? body.description.trim() : undefined;
    if (!name) {
      return NextResponse.json({ error: 'name is required' }, { status: 400 });
    }

    const list = await prisma.bookmarkList.create({
      data: { userId: session.user.id, name, description },
    });
    return NextResponse.json({ success: true, list });
  } catch (error: any) {
    if (error?.code === 'P2002') {
      return NextResponse.json({ error: 'You already have a list with this name' }, { status: 409 });
    }
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to create list' }, { status: 500 });
  }
}
