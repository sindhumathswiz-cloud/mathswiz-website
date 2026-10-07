import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { isPastGrace } from '@/lib/exam-clock';
import { isWrittenType } from '@/lib/exam-view';
import { answerImageUrl, MAX_IMAGE_BYTES, MAX_IMAGES_PER_ANSWER, sniffImageType } from '@/lib/answer-images';

export const dynamic = 'force-dynamic';

/**
 * Attach a photo of handwritten working to a written answer while the exam is running.
 * The browser downscales the photo first; the server still checks everything: whose attempt it is,
 * that the clock is running, that the question is a written one in this test, how many photos it
 * already has, and what the bytes really are.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const session = await getServerSession(authOptions);
    if (!session || (session.user as any).role !== 'STUDENT') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }
    const studentId = (session.user as any).id;

    const form = await req.formData().catch(() => null);
    const attemptId = form?.get('attemptId');
    const questionId = form?.get('questionId');
    const file = form?.get('file');
    // Duck-typed rather than `instanceof File`: the runtime's File class is not always the global one.
    if (typeof attemptId !== 'string' || typeof questionId !== 'string' || !file || typeof file === 'string' || typeof (file as Blob).arrayBuffer !== 'function') {
      return NextResponse.json({ error: 'attemptId, questionId and file are required' }, { status: 400 });
    }
    if ((file as Blob).size === 0) return NextResponse.json({ error: 'The photo is empty' }, { status: 400 });
    if ((file as Blob).size > MAX_IMAGE_BYTES) return NextResponse.json({ error: 'That photo is too large. Take it again at a lower resolution.' }, { status: 413 });

    const attempt = await prisma.testAttempt.findFirst({ where: { id: attemptId, userId: studentId, testId: id, status: 'IN_PROGRESS' } });
    if (!attempt) return NextResponse.json({ error: 'Attempt not found' }, { status: 404 });
    const test = await prisma.test.findUnique({ where: { id }, select: { duration: true } });
    if (!test) return NextResponse.json({ error: 'Test not found' }, { status: 404 });
    if (!attempt.examStartedAt || isPastGrace(attempt, test.duration)) {
      return NextResponse.json({ error: 'The exam is not running, so photos can no longer be added.' }, { status: 409 });
    }

    const placement = await prisma.testQuestion.findFirst({
      where: { questionId, section: { testId: id } },
      select: { question: { select: { type: true } } },
    });
    if (!placement || !isWrittenType(placement.question.type)) {
      return NextResponse.json({ error: 'Photos can only be added to written-answer questions' }, { status: 400 });
    }

    const existing = await prisma.answerImage.count({ where: { attemptId, questionId } });
    if (existing >= MAX_IMAGES_PER_ANSWER) {
      return NextResponse.json({ error: `You can attach up to ${MAX_IMAGES_PER_ANSWER} photos to an answer.` }, { status: 409 });
    }

    const bytes = Buffer.from(await (file as Blob).arrayBuffer());
    const mimeType = sniffImageType(bytes);
    if (!mimeType) return NextResponse.json({ error: 'Only JPEG, PNG or WebP photos are accepted' }, { status: 415 });

    const image = await prisma.answerImage.create({
      data: { attemptId, questionId, userId: studentId, mimeType, size: bytes.length, bytes },
      select: { id: true, size: true },
    });
    return NextResponse.json({ id: image.id, url: answerImageUrl(image.id), size: image.size });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
