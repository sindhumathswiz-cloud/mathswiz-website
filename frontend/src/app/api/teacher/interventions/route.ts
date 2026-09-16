import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { recordAuditLog, requestAuditContext } from '@/lib/audit-log';
import { masteryToDifficultyBand, selectQuestionsByFilters } from '@/lib/question-selection';

const REMEDIAL_PRACTICE_COUNT = 8;

export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id || session.user.role !== 'TEACHER') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const batchId = new URL(req.url).searchParams.get('batchId');
  const enrollments = await prisma.batchEnrollment.findMany({ where: { status: 'APPROVED', batch: { teacherId: session.user.id }, ...(batchId ? { batchId } : {}) }, select: { batchId: true, studentId: true, student: { select: { id: true, firstName: true, lastName: true } } } });
  const studentIds = [...new Set(enrollments.map((item) => item.studentId))];
  const [interventions, weakProgress] = await Promise.all([
    prisma.intervention.findMany({ where: { teacherId: session.user.id, ...(batchId ? { batchId } : {}) }, include: { student: { select: { id: true, firstName: true, lastName: true } }, batch: { select: { id: true, name: true } }, testAssignment: { include: { test: { select: { id: true, title: true } } } } }, orderBy: [{ status: 'asc' }, { dueDate: 'asc' }, { createdAt: 'desc' }] }),
    prisma.studentProgress.findMany({ where: { userId: { in: studentIds }, masteryScore: { lt: 40 } }, orderBy: { masteryScore: 'asc' } }),
  ]);
  const students = new Map(enrollments.map((item) => [item.studentId, { ...item.student, batchId: item.batchId }]));
  const suggestions = weakProgress.map((item) => ({ ...item, student: students.get(item.userId) })).filter((item) => item.student);
  return NextResponse.json({ interventions, suggestions });
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id || session.user.role !== 'TEACHER') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const body = await req.json();
  const studentId = typeof body.studentId === 'string' ? body.studentId : '';
  const batchId = typeof body.batchId === 'string' ? body.batchId : '';
  const topic = typeof body.topic === 'string' ? body.topic.trim().slice(0, 200) : '';
  const title = typeof body.title === 'string' ? body.title.trim().slice(0, 200) : '';
  const description = typeof body.description === 'string' ? body.description.trim().slice(0, 10_000) : '';
  const allowedTypes = ['PRACTICE', 'HOMEWORK', 'LIVE_SUPPORT', 'MATERIAL', 'OTHER'] as const;
  const type = allowedTypes.includes(body.type) ? body.type as typeof allowedTypes[number] : 'PRACTICE';
  if (!studentId || !batchId || !topic || !title || !description) return NextResponse.json({ error: 'Student, batch, topic, title, and description are required' }, { status: 400 });
  const enrollment = await prisma.batchEnrollment.findFirst({ where: { studentId, batchId, status: 'APPROVED', batch: { teacherId: session.user.id } }, select: { id: true } });
  if (!enrollment) return NextResponse.json({ error: 'Student is not in your approved batch' }, { status: 404 });
  const dueDate = body.dueDate ? new Date(body.dueDate) : null;
  if (dueDate && Number.isNaN(dueDate.getTime())) return NextResponse.json({ error: 'Invalid due date' }, { status: 400 });

  // Only PRACTICE/HOMEWORK interventions are meant to carry a generated
  // question set -- LIVE_SUPPORT/MATERIAL/OTHER stay description-only.
  // The question fetch is a read, so it happens before the transaction;
  // only the writes below need to be atomic.
  let generatedQuestions: Awaited<ReturnType<typeof selectQuestionsByFilters>> = [];
  if (type === 'PRACTICE' || type === 'HOMEWORK') {
    const progress = await prisma.studentProgress.findFirst({ where: { userId: studentId, topic }, select: { masteryScore: true } });
    const band = masteryToDifficultyBand(progress?.masteryScore ?? 0);
    const perDifficulty = Math.max(1, Math.ceil(REMEDIAL_PRACTICE_COUNT / band.length));
    generatedQuestions = await selectQuestionsByFilters(band.map((difficulty) => ({ topic, difficulty, count: perDifficulty })));
  }

  const intervention = await prisma.$transaction(async (tx) => {
    let testAssignmentId: string | null = null;
    if (generatedQuestions.length > 0) {
      const practiceTest = await tx.test.create({
        data: {
          title: `Remedial practice: ${topic}`,
          description,
          mode: 'PRACTICE',
          isPublished: true,
          createdById: session.user.id,
          sections: {
            create: [{
              title: 'Practice',
              marksPerQuestion: 1,
              negativeMarks: 0,
              questions: { create: generatedQuestions.map((q, i) => ({ questionId: q.id, orderIndex: i })) },
            }],
          },
        },
      });
      const assignment = await tx.testAssignment.create({
        data: { testId: practiceTest.id, studentId, kind: 'HOMEWORK', instructions: description.slice(0, 2000) },
      });
      testAssignmentId = assignment.id;
    }

    const created = await tx.intervention.create({ data: { teacherId: session.user.id, studentId, batchId, topic, title, description, type, dueDate, testAssignmentId } });
    await tx.notification.create({
      data: {
        userId: studentId,
        title: 'New learning support assigned',
        message: testAssignmentId
          ? `${title}: a practice set is ready for you on ${topic}.`
          : `${title}: ${description}`.slice(0, 5000),
        type: 'INTERVENTION',
        targetRole: 'STUDENT',
        targetBatchId: batchId,
      },
    });
    return created;
  });
  await recordAuditLog({ actorId: session.user.id, actorRole: 'TEACHER', action: 'INTERVENTION_ASSIGNED', entityType: 'Intervention', entityId: intervention.id, metadata: { studentId, batchId, topic, type, dueDate, testAssignmentId: intervention.testAssignmentId }, ...requestAuditContext(req) });
  return NextResponse.json({ intervention }, { status: 201 });
}
