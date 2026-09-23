import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';

export const dynamic = 'force-dynamic';

/**
 * Admin-facing list of student-reported "flag as incorrect" questions.
 * Defaults to PENDING so the admin dashboard surfaces what needs action;
 * pass ?status=ALL (or CORRECTED/REJECTED) to see resolved history.
 */
export async function GET(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id || session.user.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const statusParam = new URL(request.url).searchParams.get('status');
    const status = statusParam && statusParam !== 'ALL' ? statusParam : undefined;

    const flags = await prisma.questionFlag.findMany({
      where: status ? { status: status as any } : undefined,
      orderBy: { createdAt: 'desc' },
      take: 200,
      include: {
        question: {
          select: { id: true, content: true, options: true, correctAnswer: true, explanation: true, type: true, status: true, topic: true, subject: true, difficulty: true },
        },
        flaggedBy: { select: { id: true, firstName: true, lastName: true, email: true } },
        resolvedBy: { select: { id: true, firstName: true, lastName: true } },
      },
    });

    return NextResponse.json({ flags });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to load flagged questions' }, { status: 500 });
  }
}
