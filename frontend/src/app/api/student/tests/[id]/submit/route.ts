import { NextResponse } from 'next/server';
import prisma from "@/lib/prisma";
import { getServerSession } from 'next-auth';
import { authOptions } from "@/lib/auth";
import { revalidatePath } from 'next/cache';
import { awardPoints, POINTS_RULES } from '@/lib/gamification';
import { recordAuditLog, requestAuditContext } from '@/lib/audit-log';
import { applyMasteryUpdate } from '@/lib/mastery';
import { withSerializableRetry } from '@/lib/prisma-retry';
import { recordQuestionReview } from '@/lib/spaced-repetition-review';
import { AUTO_SCORED_TYPES, answersMatch, countedQuestionIds, hasChoice, isAnswered } from '@/lib/exam-scoring';
import { slotKeyOf } from '@/lib/choice-groups';
import { roundMarks } from '@/lib/exam-patterns';
import { answersToScore, isPastGrace } from '@/lib/exam-clock';
import { isWrittenType } from '@/lib/exam-view';
import { answerImageUrl, encodeImageRefs, MAX_IMAGES_PER_ANSWER } from '@/lib/answer-images';

export const dynamic = 'force-dynamic';

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const session = await getServerSession(authOptions);
    if (!session || (session.user as any).role !== 'STUDENT') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }
    const studentId = (session.user as any).id;

    const { attemptId, responses: submittedResponses } = await req.json();

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

    // The server's clock decides which answers count. Within the deadline plus a short grace the request is
    // trusted; after it, only what was saved while the clock was running is scored, so a paper cannot be
    // kept open and answered late.
    const scoring = answersToScore<Record<string, any>>({
      pastGrace: isPastGrace(attempt, test.duration),
      submitted: submittedResponses,
      saved: attempt.savedResponses as Record<string, any> | null,
    });
    // Photos can only be ones this student uploaded to this attempt for that question: a made-up or
    // someone else's id is dropped, and no raw URL from the request is ever stored.
    const uploaded = await prisma.answerImage.findMany({ where: { attemptId, userId: studentId }, select: { id: true, questionId: true } });
    const imageIdsByQuestion = new Map<string, Set<string>>();
    for (const image of uploaded) {
      if (!imageIdsByQuestion.has(image.questionId)) imageIdsByQuestion.set(image.questionId, new Set());
      imageIdsByQuestion.get(image.questionId)!.add(image.id);
    }
    const responses: Record<string, any> = {};
    for (const [questionId, response] of Object.entries(scoring.responses as Record<string, any>)) {
      if (!response || typeof response !== 'object') continue;
      const valid = Array.isArray(response.subjectiveImages)
        ? response.subjectiveImages.filter((id: unknown): id is string => typeof id === 'string' && !!imageIdsByQuestion.get(questionId)?.has(id)).slice(0, MAX_IMAGES_PER_ANSWER)
        : [];
      responses[questionId] = { ...response, subjectiveImages: valid };
    }

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
    const needsTeacherMarking = !!homeworkAssignment || test.templateType === 'MOCK_EXAM';

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
    const masteryItems: Array<{ topic: string; questionId: string; isCorrect: boolean; difficulty: string | null; timeSpent: number; wasMarkedForReview: boolean }> = [];

    for (const section of test.sections) {
      // "Attempt any N": only the first N answered questions score. Null = no limit.
      const counted = countedQuestionIds(
        { attemptLimit: section.attemptLimit, questions: section.questions.map((tq) => ({ id: tq.question.id, choiceGroup: tq.choiceGroup })) },
        responses ?? {},
      );
      // A question left blank counts as skipped once per slot: not at all if its alternative was answered,
      // and once (not twice) when neither alternative was.
      const slotAnswered = new Map<string, boolean>();
      for (const tq of section.questions) {
        const key = slotKeyOf({ id: tq.question.id, choiceGroup: tq.choiceGroup });
        slotAnswered.set(key, (slotAnswered.get(key) ?? false) || isAnswered(responses[tq.question.id]));
      }
      const skippedSlots = new Set<string>();
      const noteSkipped = (tq: { question: { id: string }; choiceGroup: string | null }) => {
        const key = slotKeyOf({ id: tq.question.id, choiceGroup: tq.choiceGroup });
        if (slotAnswered.get(key) || skippedSlots.has(key)) return;
        skippedSlots.add(key);
        totalSkipped++;
      };
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

        const isSubjective = isWrittenType(q.type);

        if (isSubjective && studentResponse) {
          subjectiveText = typeof studentResponse.subjectiveText === 'string'
            ? studentResponse.subjectiveText.trim().slice(0, 20_000) || null
            : null;
          subjectiveImage = encodeImageRefs(studentResponse.subjectiveImages.map(answerImageUrl));
          if (subjectiveText || subjectiveImage) {
            if (counted && !counted.has(q.id)) {
              // The other alternative (internal choice) or an "attempt any N" limit already used this slot:
              // kept on the record, never queued for marking.
              status = 'OVER_LIMIT';
            } else {
              status = 'ANSWERED';
              // Written answers are marked by a teacher: homework always, and a mock exam that has them.
              reviewStatus = needsTeacherMarking ? 'PENDING' : 'NOT_REQUIRED';
            }
          } else {
            noteSkipped(tq);
          }
        } else if (!isSubjective && hasChoice(studentResponse)) {
          status = 'ANSWERED';
          selectedOption = String(studentResponse.selectedOption).trim();

          if (counted && !counted.has(q.id)) {
            // Answered beyond the section's limit: kept on the record, but it neither
            // scores nor counts as right, wrong or skipped.
            status = 'OVER_LIMIT';
          } else if (AUTO_SCORED_TYPES.includes(q.type)) {
            if (answersMatch(q.type, q.correctAnswer, selectedOption)) {
              isCorrect = true;
              marksAwarded = section.marksPerQuestion;
              totalCorrect++;
            } else {
              isCorrect = false;
              marksAwarded = section.negativeMarks > 0 ? -section.negativeMarks : 0; // subtract negative marks (never store -0)
              totalIncorrect++;
            }
            if (q.topic) {
              masteryItems.push({
                topic: q.topic,
                questionId: q.id,
                isCorrect,
                difficulty: q.difficulty ?? null,
                timeSpent: studentResponse?.timeSpent || 0,
                wasMarkedForReview: studentResponse?.status === 'MARKED_FOR_REVIEW' || studentResponse?.status === 'ANSWERED_AND_MARKED',
              });
            }
          }
        } else {
          noteSkipped(tq);
        }

        totalScore += marksAwarded;

        // Scoring above is already fully finalized -- this only changes what
        // gets persisted for the response, so propagating the client's
        // "marked for review" flag here can't affect isCorrect/marksAwarded
        // or any of the totals.
        const storedStatus = status !== 'OVER_LIMIT' && (studentResponse?.status === 'MARKED_FOR_REVIEW' || studentResponse?.status === 'ANSWERED_AND_MARKED')
          ? 'MARKED_FOR_REVIEW'
          : status;

        responseRecords.push({
          attemptId,
          questionId: q.id,
          selectedOption,
          subjectiveText,
          subjectiveImage,
          isCorrect,
          marksAwarded,
          status: storedStatus,
          reviewStatus,
          timeSpent: studentResponse?.timeSpent || 0
        });
      }
    }

    // Fractional schemes (2.5 for, 0.83 against) otherwise leave 1.6700000000000002 in the database.
    totalScore = roundMarks(totalScore);

    // A per-attempt time baseline for SM-2 quality derivation (no per-question
    // history query needed here, unlike the single-question practice-arena
    // path -- this attempt's own answered responses are a fine baseline).
    const answeredTimes = responseRecords.filter((r) => r.timeSpent > 0).map((r) => r.timeSpent).sort((a, b) => a - b);
    const medianTime = answeredTimes.length > 0 ? answeredTimes[Math.floor(answeredTimes.length / 2)] : 45;

    const submittedAt = new Date();
    const updatedAttempt = await withSerializableRetry(() => prisma.$transaction(async (tx) => {
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
        await recordQuestionReview(tx, {
          userId: studentId,
          questionId: item.questionId,
          signal: { isCorrect: item.isCorrect, timeSpent: item.timeSpent, medianTime, wasMarkedForReview: item.wasMarkedForReview },
          at: submittedAt,
        });
      }
      return tx.testAttempt.findUniqueOrThrow({ where: { id: attemptId } });
    }, { isolationLevel: 'Serializable' }));

    // Photos uploaded during the exam but not attached to a submitted answer are of no further use.
    const keptIds = responseRecords.flatMap((record) => (record.subjectiveImage ? JSON.parse(record.subjectiveImage) as string[] : []).map((url) => url.split('/').pop() as string));
    await prisma.answerImage.deleteMany({ where: { attemptId, id: { notIn: keptIds } } }).catch(() => {});

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
      metadata: { testId: id, totalScore, totalCorrect, totalIncorrect, totalSkipped, ...(scoring.usedSavedCopy ? { scoredFromSavedCopy: true } : {}) },
      ...requestAuditContext(req),
    });

    // Nuclear Revalidation: Refresh all student pages
    revalidatePath('/student', 'layout');

    return NextResponse.json({ ...updatedAttempt, pointsAwarded: POINTS_RULES.TEST_COMPLETED, scoredFromSavedCopy: scoring.usedSavedCopy, pendingReview: responseRecords.filter((r) => r.reviewStatus === 'PENDING').length });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
