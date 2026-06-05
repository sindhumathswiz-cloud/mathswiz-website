import { NextResponse } from 'next/server';
import prisma from "@/lib/prisma";
import { getServerSession } from 'next-auth';
import { authOptions } from "@/lib/auth";

export const dynamic = 'force-dynamic';

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const session = await getServerSession(authOptions);
    if (!session || (session.user as any).role !== 'STUDENT') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }
    const studentId = (session.user as any).id;

    // Fetch the test with sections and questions, meticulously excluding correct answers
    const test = await prisma.test.findUnique({
      where: { id },
      include: {
        sections: {
          include: {
            questions: {
              include: {
                question: {
                  select: { // CRITICAL: Exclude correctAnswer and explanation
                    id: true,
                    content: true,
                    options: true,
                    type: true,
                    difficulty: true,
                    subject: true,
                    class: true,
                    tags: true,
                  }
                }
              }
            }
          }
        }
      }
    });

    if (!test) {
      return NextResponse.json({ error: 'Test not found' }, { status: 404 });
    }

    let attempt = await prisma.testAttempt.findFirst({
        where: { testId: id, userId: studentId, status: 'IN_PROGRESS' }
    });

    if (!attempt) {
        attempt = await prisma.testAttempt.create({
            data: { testId: id, userId: studentId, status: 'IN_PROGRESS' }
        });
    }

    return NextResponse.json({ test, attempt });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
