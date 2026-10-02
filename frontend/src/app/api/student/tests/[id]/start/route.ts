import { NextResponse } from 'next/server';
import prisma from "@/lib/prisma";
import { getServerSession } from 'next-auth';
import { authOptions } from "@/lib/auth";
import { isFreePreviewQuestion } from '@/lib/free-preview-content';
import { isPremiumSubscription } from '@/lib/subscription';

export const dynamic = 'force-dynamic';

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const session = await getServerSession(authOptions);
    if (!session || (session.user as any).role !== 'STUDENT') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }
    const studentId = (session.user as any).id;
    const student = await prisma.user.findUnique({ where: { id: studentId }, select: { subscription: true } });
    const isPremium = isPremiumSubscription(student?.subscription);
    const now = new Date();

    const assignment = await (prisma as any).testAssignment.findFirst({
      where: {
        testId: id,
        AND: [
          { OR: [
            { studentId },
            { batch: { enrollments: { some: { studentId, status: 'APPROVED' } } } },
          ] },
          { OR: [{ scheduledFor: null }, { scheduledFor: { lte: now } }] },
          { OR: [{ deadline: null }, { deadline: { gte: now } }] },
        ],
      },
      select: { id: true, maxAttempts: true },
    });
    if (!assignment) return NextResponse.json({ error: 'This test is not assigned to you' }, { status: 403 });

    const submittedAttempts = await prisma.testAttempt.count({
      where: { testId: id, userId: studentId, status: { in: ['SUBMITTED', 'AUTO_SUBMITTED'] } },
    });
    if (submittedAttempts >= assignment.maxAttempts) {
      return NextResponse.json({ error: 'Maximum attempts reached' }, { status: 403 });
    }

    // Fetch the test with sections and questions, meticulously excluding correct answers
    const test = await prisma.test.findUnique({
      where: { id, isPublished: true },
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
                    topic: true,
                    bookChapter: { select: { orderIndex: true } },
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

    const testQuestions = test.sections.flatMap((section: any) => section.questions.map((item: any) => item.question));
    if (!isPremium) {
      // isFreePreviewQuestion is async -- must be awaited per question
      // rather than called inside a synchronous .some(), which would negate
      // a Promise object (always truthy) and never actually block anything.
      const eligibility = await Promise.all(testQuestions.map((question: any) => isFreePreviewQuestion(question)));
      if (testQuestions.length === 0 || eligibility.some((ok: boolean) => !ok)) {
        return NextResponse.json({ error: 'This assessment is available with a premium subscription. Try the free first-chapter mock from the preview.' }, { status: 403 });
      }
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
