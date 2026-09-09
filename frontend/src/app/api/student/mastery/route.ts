import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id || session.user.role !== 'STUDENT') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const [topics, history] = await Promise.all([
    prisma.studentProgress.findMany({ where: { userId: session.user.id }, orderBy: [{ masteryScore: 'asc' }, { topic: 'asc' }] }),
    prisma.masteryEvent.findMany({ where: { userId: session.user.id }, orderBy: { createdAt: 'desc' }, take: 200, select: { id: true, topic: true, source: true, previousScore: true, newScore: true, delta: true, isCorrect: true, createdAt: true } }),
  ]);
  return NextResponse.json({ topics, history });
}
