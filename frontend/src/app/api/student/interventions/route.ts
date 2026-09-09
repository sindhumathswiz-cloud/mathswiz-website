import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id || session.user.role !== 'STUDENT') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const interventions = await prisma.intervention.findMany({ where: { studentId: session.user.id, status: { not: 'CANCELLED' } }, include: { teacher: { select: { firstName: true, lastName: true } }, batch: { select: { name: true } } }, orderBy: [{ status: 'asc' }, { dueDate: 'asc' }, { createdAt: 'desc' }] });
  return NextResponse.json({ interventions });
}
