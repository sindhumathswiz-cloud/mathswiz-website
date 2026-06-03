import { NextResponse } from 'next/server';
import prisma from "@/lib/prisma";
import { getServerSession } from 'next-auth';
import { authOptions } from "@/lib/auth";

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || (session.user as any).role !== 'STUDENT') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    const studentId = (session.user as any).id;
    const studentClass = (session.user as any).class;

    const enrollments = await (prisma as any).batchEnrollment.findMany({
      where: { studentId, status: 'APPROVED' },
      select: { batchId: true }
    });
    const batchIds = enrollments.map((e: any) => e.batchId);

    const assignments = await (prisma as any).testAssignment.findMany({
      where: {
        OR: [
          { batchId: { in: batchIds } },
          { studentId }
        ],
        test: {
            OR: [
                { class: studentClass },
                { class: null }
            ]
        }
      },
      include: {
        test: true
      }
    });

    return NextResponse.json(assignments);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

