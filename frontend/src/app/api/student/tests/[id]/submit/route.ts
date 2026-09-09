import { NextResponse } from 'next/server';
import prisma from "@/lib/prisma";
import { getServerSession } from 'next-auth';
import { authOptions } from "@/lib/auth";
import { revalidatePath } from 'next/cache';
import { awardPoints, POINTS_RULES } from '@/lib/gamification';
import { recordAuditLog, requestAuditContext } from '@/lib/audit-log';
import { applyMasteryUpdate } from '@/lib/mastery';

export const dynamic = 'force-dynamic';

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const session = await getServerSession(authOptions);
    if (!session || (session.user as any).role !== 'STUDENT') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }
    const studentId = (session.user as any).id;

    const { attemptId, responses } = await req.json();

    const attempt = await prisma.testAttempt.findFirst({
      where: { id: attemptId, userId: studentId }
    });

    if (!attempt || attempt.testId !== id) return NextResponse.json({ error: 'Attempt not found' }, { status: 404 });
    if (attempt.status === 'SUBMITTED') return NextResponse.json({ error: 'Already submitted' }, { status: 400 });

    const test = await prisma.test.findUnique({
      where: { id },
      include: { sections: { include: { questions: { include: { question: true } } } } }
    });

    if (!test) return NextResponse.json({ error: 'Test not found' }, { status: 404 });

    const homeworkAssignment = await prisma.testAssignment.findFirst({
      where: {
        testId: id,
        kind: 'HOMEWORK',
        OR: [
          { studentId },
          { batch: { enrollments: { some: { studentId, status: 'APPROVED' } } } },
        ],
      },
      select: { id: true },
    });

    let totalScore = 0;
    let totalCorrect = 0;
    let totalIncorrect = 0;
    let totalSkipped = 0;

    const responseRecords: Array<{
      attemptId: string;
      questionId: string;
      selectedOption: string | null;
      subjectiveText: string | null;
      subjectiveImage: string | null;
      isCorrect: boolean;
      marksAwarded: number;
      status: string;
      reviewStatus: 'NOT_REQUIRED' | 'PENDING';
      timeSpent: number;
    }> = [];
    const masteryItems: Array<{ topic: string; questionId: string; isCorrect: boolean; difficulty: string | null }> = [];

    for (const section of test.sections) {
      for (const tq of section.questions) {
        const q = tq.question;
        const studentResponse = responses[q.id];

        let isCorrect = false;
        let status = 'SKIPPED';
        let marksAwarded = 0;
        let selectedOption = null;
        let subjectiveText = null;
        let subjectiveImage = null;
        let reviewStatus: 'NOT_REQUIRED' | 'PENDING' = 'NOT_REQUIRED';

        const isSubjective = ['SUBJECTIVE', 'SHORT_ANSWER', 'LONG_ANSWER', 'VERY_SHORT_ANSWER'].includes(q.type);

        if (isSubjective && studentResponse) {
          subjectiveText = typeof studentResponse.subjectiveText === 'string'
            ? studentResponse.subjectiveText.trim().slice(0, 20_000) || null
            : null;
          subjectiveImage = typeof studentResponse.subjectiveImage === 'string'
            ? studentResponse.subjectiveImage.trim().slice(0, 2_000) || null
            : null;
          if (subjectiveText || subjectiveImage) {
            status = 'ANSWERED';
            reviewStatus = homeworkAssignment ? 'PENDING' : 'NOT_REQUIRED';
          } else {
            totalSkipped++;
          }
        } else if (studentResponse && studentResponse.selectedOption !== null && studentResponse.selectedOption !== undefined) {
          status = 'ANSWERED';
          selectedOption = String(studentResponse.selectedOption);

          if (q.type === 'SINGLE_CHOICE' || q.type === 'MULTIPLE_CHOICE' || q.type === 'INTEGER' || q.type === 'TRUE_FALSE') {
            if (q.correctAnswer === selectedOption) {
              isCorrect = true;
              marksAwarded = section.marksPerQuestion;
              totalCorrect++;
            } else {
              isCorrect = false;
              marksAwarded = -section.negativeMarks; // subtract negative marks
              totalIncorrect++;
            }
            if (q.topic) masteryItems.push({ topic: q.topic, questionId: q.id, isCorrect, difficulty: q.difficulty ?? null });
          }
        } else {
          totalSkipped++;
        }

        totalScore += marksAwarded;

        responseRecords.push({
          attemptId,
          questionId: q.id,
          selectedOption,
          subjectiveText,
          subjectiveImage,
          isCorrect,
          marksAwarded,
          status,
          reviewStatus,
          timeSpent: studentResponse?.timeSpent || 0
        });
      }
    }

    const submittedAt = new Date();
    const updatedAttempt = await prisma.$transaction(async (tx) => {
      const claimed = await tx.testAttempt.updateMany({
        where: { id: attemptId, userId: studentId, status: 'IN_PROGRESS' },
        data: { status: 'SUBMITTED', endTime: submittedAt, totalScore, totalCorrect, totalIncorrect, totalSkipped },
      });
      if (claimed.count !== 1) throw new Error('Attempt was already submitted');
      await tx.testResponse.createMany({ data: responseRecords });
      for (const item of masteryItems) {
        await applyMasteryUpdate(tx, {
          userId: studentId,
          topic: item.topic,
          isCorrect: item.isCorrect,
          source: homeworkAssignment ? 'HOMEWORK' : 'TEST',
          difficulty: item.difficulty,
          attemptId,
          questionId: item.questionId,
          at: submittedAt,
        });
      }
      return tx.testAttempt.findUniqueOrThrow({ where: { id: attemptId } });
    }, { isolationLevel: 'Serializable' });

    // Award points for test completion
    await awardPoints(studentId, POINTS_RULES.TEST_COMPLETED, 'Test completed', { testId: id, score: totalScore });

    // Bonus points for perfect score
    if (totalCorrect > 0 && totalIncorrect === 0 && totalSkipped === 0) {
      await awardPoints(studentId, POINTS_RULES.TEST_PERFECT_SCORE, 'Perfect score', { testId: id });
    }

    await recordAuditLog({
      actorId: studentId,
      actorRole: (session.user as any).role,
      action: 'TEST_SUBMITTED',
      entityType: 'TestAttempt',
      entityId: attemptId,
      metadata: { testId: id, totalScore, totalCorrect, totalIncorrect, totalSkipped },
      ...requestAuditContext(req),
    });

    // Nuclear Revalidation: Refresh all student pages
    revalidatePath('/student', 'layout');

    return NextResponse.json({ ...updatedAttempt, pointsAwarded: POINTS_RULES.TEST_COMPLETED });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
