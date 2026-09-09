import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET() {
  const session = await getServerSession(authOptions);
  const teacherId = session?.user?.id;
  if (!teacherId || session.user.role !== 'TEACHER') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const responses = await prisma.testResponse.findMany({
    where: {
      reviewStatus: { in: ['PENDING', 'REVIEWED'] },
      attempt: {
        status: { in: ['SUBMITTED', 'AUTO_SUBMITTED'] },
        test: {
          assignments: {
            some: {
              kind: 'HOMEWORK',
              OR: [{ batch: { teacherId } }, { test: { createdById: teacherId } }],
            },
          },
        },
      },
    },
    select: {
      id: true,
      subjectiveText: true,
      subjectiveImage: true,
      marksAwarded: true,
      reviewStatus: true,
      teacherFeedback: true,
      reviewedAt: true,
      question: { select: { id: true, content: true, explanation: true } },
      attempt: {
        select: {
          id: true,
          endTime: true,
          user: { select: { id: true, firstName: true, lastName: true } },
          test: { select: { id: true, title: true, totalMarks: true } },
        },
      },
    },
    orderBy: [{ reviewStatus: 'asc' }, { attempt: { endTime: 'desc' } }],
    take: 200,
  });

  return NextResponse.json({ submissions: responses });
}
