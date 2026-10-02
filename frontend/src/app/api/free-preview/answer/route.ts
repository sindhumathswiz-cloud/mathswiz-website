import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { extractClaimedAnswerIndex, parseQuestionOptions, resolveCorrectOptionIndex } from '@/lib/arena-answer';
import { isFreePreviewQuestion } from '@/lib/free-preview-content';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    if (typeof body.questionId !== 'string' || !Number.isInteger(body.answerIndex) || body.answerIndex < 0 || body.answerIndex > 9) {
      return NextResponse.json({ error: 'Invalid answer request.' }, { status: 400 });
    }
    const question = await prisma.question.findFirst({
      where: { id: body.questionId, status: 'APPROVED', scope: 'PUBLIC' },
      select: { class: true, topic: true, options: true, correctAnswer: true, explanation: true, bookChapter: { select: { orderIndex: true } } },
    });
    if (!question || !await isFreePreviewQuestion(question)) return NextResponse.json({ error: 'Preview question not found.' }, { status: 404 });
    const options = parseQuestionOptions(question.options);
    const correctIndex = resolveCorrectOptionIndex(question.correctAnswer, options);
    if (correctIndex < 0 || body.answerIndex >= options.length) return NextResponse.json({ error: 'This question is not available for preview.' }, { status: 422 });
    const claimedIndex = extractClaimedAnswerIndex(question.explanation);
    const explanation = claimedIndex === null || claimedIndex === correctIndex ? question.explanation : null;
    return NextResponse.json({ isCorrect: body.answerIndex === correctIndex, explanation: explanation || 'Review the worked method, then retry this question in your next practice session.' });
  } catch {
    return NextResponse.json({ error: 'Unable to check that answer right now.' }, { status: 500 });
  }
}
