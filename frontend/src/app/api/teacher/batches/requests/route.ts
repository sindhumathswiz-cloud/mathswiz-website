import { NextResponse } from 'next/server';
import prisma from "@/lib/prisma";
import { getServerSession } from 'next-auth';
import { authOptions } from "@/lib/auth";

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || (session.user as any).role !== 'TEACHER') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    const teacherId = (session.user as any).id;
    const requests = await prisma.batchEnrollment.findMany({
      where: {
        status: 'PENDING',
        batch: {
          teacherId
        }
      },
      include: {
        student: {
          select: { id: true, firstName: true, lastName: true, email: true, mobileNumber: true, class: true }
        },
        batch: {
          select: { id: true, name: true, code: true, feeAmount: true } as any
        }
      } as any
    });

    return NextResponse.json(requests);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

