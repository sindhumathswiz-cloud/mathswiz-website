import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';

export async function PATCH(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id || session.user.role !== 'STUDENT') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await params;
  const existing = await prisma.intervention.findFirst({ where: { id, studentId: session.user.id, status: 'ASSIGNED' }, select: { id: true } });
  if (!existing) return NextResponse.json({ error: 'Assigned intervention not found' }, { status: 404 });
  const intervention = await prisma.intervention.update({ where: { id }, data: { status: 'IN_PROGRESS' } });
  return NextResponse.json({ intervention });
}
