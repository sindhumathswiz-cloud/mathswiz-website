import { NextResponse } from 'next/server';
import prisma from "@/lib/prisma";
import { getServerSession } from 'next-auth';
import { authOptions } from "@/lib/auth";

export const dynamic = 'force-dynamic';

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    
    const session = await getServerSession(authOptions);
    if (!session || (session.user as any).role !== 'TEACHER') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }
    const teacherId = (session.user as any).id;

    const student = await prisma.user.findUnique({
      where: { 
        id,
        enrollments: {
            some: {
                batch: { teacherId }
            }
        }
      },
      include: {
        enrollments: {
          where: { batch: { teacherId } }, // Only show teacher's batch enrollments
          include: {
            batch: true,
            payments: true
          } as any
        },
        testAttempts: {
          where: { test: { createdById: teacherId } }, // Only show teacher's test attempts
          include: { test: true }
        }
      }
    });

    if (!student) {
      return NextResponse.json({ error: 'Student not found' }, { status: 404 });
    }

    return NextResponse.json(student);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
