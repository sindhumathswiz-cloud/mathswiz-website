import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getAuthenticatedUser } from '@/lib/auth-server';
import { recordAuditLog, requestAuditContext } from '@/lib/audit-log';

export const dynamic = 'force-dynamic';

/**
 * Retroactive cleanup: strips the book's own printed exercise/question serial
 * number ("1. ", "19. ", "Q1.", "Question 1 ") from the START of `content` on
 * already-saved rows.
 *
 * The extraction pipeline itself was fixed (structure-questions.ts prompt +
 * extract-normalizer.ts's stripLeadingQuestionNumber) so NEW extractions no
 * longer have this problem, but that fix only applies going forward — rows
 * saved before it still carry the stray number. This endpoint applies the
 * identical rule to existing rows, one time.
 *
 * Anchored to the start only and requires trailing whitespace, so it never
 * touches a case-study passage's own "(i)"/"(ii)" sub-part labels further
 * into the text, and never mistakes a genuine leading decimal (e.g. "2.5 kg
 * ...") for a serial number — same guarantees as the normalizer function.
 *
 * Every changed row gets a QuestionVersion snapshot of its prior content
 * before being overwritten, so the edit is reviewable/reversible, not a
 * blind in-place rewrite.
 */
const LEADING_NUMBER_RE = /^\s*(?:Q(?:uestion)?[\s.]*)?\(?\d{1,3}\)?[.)]\s+/i;

export async function POST(request: Request) {
  const auth = await getAuthenticatedUser(['ADMIN']);
  if ('error' in auth) return auth.error;

  const body = await request.json().catch(() => null);
  const bookId = body?.bookId;
  const dryRun = body?.dryRun === true;
  if (typeof bookId !== 'string' || !bookId) {
    return NextResponse.json({ error: 'bookId is required' }, { status: 400 });
  }

  const candidates = await prisma.question.findMany({
    where: { bookId, status: { in: ['DRAFT', 'PENDING_REVIEW', 'APPROVED', 'REPORTED'] } },
    select: {
      id: true, content: true, options: true, correctAnswer: true, explanation: true,
      type: true, difficulty: true, topic: true, subTopic: true, tags: true, currentVersion: true,
    },
  });

  const toFix = candidates
    .map((q) => ({ q, stripped: q.content.replace(LEADING_NUMBER_RE, '').trim() }))
    .filter(({ q, stripped }) => stripped && stripped !== q.content);

  if (dryRun) {
    return NextResponse.json({
      wouldFix: toFix.length,
      preview: toFix.slice(0, 10).map(({ q, stripped }) => ({ id: q.id, before: q.content.slice(0, 60), after: stripped.slice(0, 60) })),
    });
  }

  const results: { id: string; ok: boolean; error?: string }[] = [];
  for (const { q, stripped } of toFix) {
    try {
      await prisma.$transaction([
        prisma.questionVersion.create({
          data: {
            questionId: q.id,
            version: q.currentVersion,
            content: q.content,
            options: q.options ?? undefined,
            correctAnswer: q.correctAnswer,
            explanation: q.explanation,
            type: q.type,
            difficulty: q.difficulty,
            topic: q.topic,
            subTopic: q.subTopic,
            tags: q.tags,
            changedBy: auth.user.id,
            changeReason: 'Automated cleanup: stripped stray leading printed question number from content',
          },
        }),
        prisma.question.update({
          where: { id: q.id },
          data: { content: stripped, currentVersion: { increment: 1 } },
        }),
      ]);
      results.push({ id: q.id, ok: true });
    } catch (error) {
      results.push({ id: q.id, ok: false, error: error instanceof Error ? error.message : String(error) });
    }
  }

  const fixed = results.filter((r) => r.ok).length;
  await recordAuditLog({
    actorId: auth.user.id,
    actorRole: 'ADMIN',
    action: 'QUESTION_LEADING_NUMBER_STRIPPED_BULK',
    entityType: 'Question',
    entityId: bookId,
    metadata: { bookId, fixed, failed: results.length - fixed },
    ...requestAuditContext(request),
  });

  return NextResponse.json({ scanned: candidates.length, fixed, failed: results.length - fixed, results });
}
