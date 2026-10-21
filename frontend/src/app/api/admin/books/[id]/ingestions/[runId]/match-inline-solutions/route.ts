import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getAuthenticatedUser } from '@/lib/auth-server';
import { recordAuditLog, requestAuditContext } from '@/lib/audit-log';
import { loadConfirmedChapters } from '@/lib/book-manifest';
import { findInlineSolution, runningFooters, type PageText } from '@/lib/inline-solutions';
import { analyzeQuestion, worstSeverity } from '@/lib/question-qa';

export const runtime = 'nodejs';
export const maxDuration = 240;

/**
 * The third matching pass, beside match-answer-keys and match-detailed-solutions: worked solutions printed straight
 * after their question ("17. ... Sol. ..."). Extraction keeps such a solution only when the model returns it, and a
 * fallback model's answers and solutions are stripped as unverifiable (structure-questions.ts) -- so on a page Gemini
 * could not read, every question loses the solution printed under it. This copies that printed text back from the
 * page (lib/inline-solutions.ts): the book's own words, never a model's.
 *
 * Conservative like the other two passes: only DRAFT questions with a printed number and no explanation, and only in
 * a confirmed chapter's section marked as printing its answers inline; the question's own text must be found at its
 * number on its page. Preview by default; { apply: true } writes. Every write adds a review note saying where the
 * solution was copied from. { refresh: true } also re-copies the solutions this pass wrote before (tagged "Solution
 * from page text"), for when the copying itself has been improved -- and takes back one it can no longer place.
 *
 * A case-study part ("(iii)", "2(iii)") gets its own part of the case's printed solution, and for a multiple-choice
 * part without an answer, the letter its printed "Option (x) is correct" gives.
 */

const MAX_DETAILS = 200;
const TAG_NO_SOLUTION = 'Questions without Solutions';
const TAG_SOLUTION_FROM_PAGE = 'Solution from page text';
// A solution can run over a page turn; two pages after the question's own is plenty.
const PAGES_AFTER = 2;

export async function POST(request: Request, { params }: { params: Promise<{ id: string; runId: string }> }) {
  const auth = await getAuthenticatedUser(['ADMIN']);
  if ('error' in auth) return auth.error;
  const { id, runId } = await params;
  const body = await request.json().catch(() => ({}));
  const apply = body.apply === true;
  const refresh = body.refresh === true;

  const run = await prisma.bookIngestionRun.findFirst({ where: { id: runId, bookId: id }, select: { id: true, sourceDocumentId: true } });
  if (!run?.sourceDocumentId) return NextResponse.json({ error: 'Book ingestion run not found' }, { status: 404 });

  const confirmedChapters = await loadConfirmedChapters(id);
  // Inline-answer sections, with the last page their solutions may run to (the chapter's end).
  const sections = confirmedChapters.flatMap((chapter) => chapter.exercises
    .filter((s) => s.inlineAnswers && !s.noAnswers && s.startPage != null && s.endPage != null)
    .map((s) => ({ startPage: s.startPage as number, endPage: s.endPage as number, chapterEnd: chapter.endPage as number })));
  if (!sections.length) {
    return NextResponse.json({ apply, manifestConfirmed: confirmedChapters.length > 0, sections: 0, candidates: 0, matched: 0, updated: 0, details: [] });
  }

  const pageRows = await prisma.documentPage.findMany({
    where: { documentId: run.sourceDocumentId },
    orderBy: { pageNumber: 'asc' },
    select: { pageNumber: true, rawText: true, rawMarkdown: true },
  });
  const pages: PageText[] = pageRows.map((p) => ({ pageNumber: p.pageNumber, text: p.rawText || p.rawMarkdown || '' }));
  const byNumber = new Map(pages.map((p) => [p.pageNumber, p]));
  const footers = runningFooters(pages.map((p) => p.text));

  const candidates = await prisma.question.findMany({
    where: {
      bookId: id,
      status: 'DRAFT',
      printedNumber: { not: null },
      OR: [{ explanation: null }, { explanation: '' }, ...(refresh ? [{ tags: { has: TAG_SOLUTION_FROM_PAGE } }] : [])],
      AND: [{ OR: sections.map((s) => ({ sourcePageStart: { gte: s.startPage, lte: s.endPage } })) }],
    },
    select: { id: true, content: true, type: true, options: true, correctAnswer: true, tags: true, reviewNotes: true, printedNumber: true, sourcePageStart: true },
  });

  const reasons: Record<string, number> = {};
  let matched = 0;
  let updated = 0;
  let answersFilled = 0;
  let cleared = 0;
  const details: Array<{ questionId: string; page: number | null; printedNumber: string | null; outcome: string; solutionPages?: string; preview?: string }> = [];

  for (const question of candidates) {
    const page = question.sourcePageStart as number;
    const section = sections.find((s) => page >= s.startPage && page <= s.endPage)!;
    const window: PageText[] = [];
    for (let p = page; p <= Math.min(page + PAGES_AFTER, section.chapterEnd); p++) if (byNumber.has(p)) window.push(byNumber.get(p)!);
    const result = findInlineSolution({ pages: window, startPage: page, printedNumber: question.printedNumber as string, questionContent: question.content, footers });

    // A solution this pass copied before (refresh).
    const copiedBefore = question.tags.includes(TAG_SOLUTION_FROM_PAGE);
    if (!result.found) {
      reasons[result.reason] = (reasons[result.reason] ?? 0) + 1;
      if (details.length < MAX_DETAILS) details.push({ questionId: question.id, page, printedNumber: question.printedNumber, outcome: copiedBefore ? `${result.reason} (copied before: ${apply ? 'cleared' : 'would clear'})` : result.reason });
      // What this pass wrote and can no longer place is taken back; nothing else is ever cleared.
      if (apply && copiedBefore) {
        const note = `Copied solution taken back on re-check (${result.reason.replace(/_/g, ' ')}).`;
        await prisma.question.update({
          where: { id: question.id },
          data: {
            explanation: null,
            tags: Array.from(new Set([...question.tags.filter((t) => t !== TAG_SOLUTION_FROM_PAGE), TAG_NO_SOLUTION])),
            reviewNotes: question.reviewNotes ? `${question.reviewNotes}\n${note}` : note,
          },
        });
        cleared++;
      }
      continue;
    }
    matched++;
    const options = Array.isArray(question.options) ? question.options : [];
    const letter = result.answerLetter && !question.correctAnswer && options.length >= 2 && result.answerLetter.charCodeAt(0) - 65 < options.length ? result.answerLetter : null;
    const solutionPages = result.startPage === result.endPage ? `p.${result.startPage}` : `pp.${result.startPage}–${result.endPage}`;
    if (details.length < MAX_DETAILS) details.push({ questionId: question.id, page, printedNumber: question.printedNumber, outcome: apply ? 'updated' : 'would_update', solutionPages, ...(letter ? { answer: letter } : {}), preview: result.text.slice(0, 120) });
    if (letter) answersFilled++;
    if (!apply) continue;

    const note = `Worked solution${letter ? ` and answer (${letter})` : ''} copied from the printed page (${solutionPages}), where it follows question ${question.printedNumber} -- the book's own text, not solved; check it reads correctly before approving.`;
    const qaIssues = analyzeQuestion({ content: question.content, options: question.options as string[] | undefined, correctAnswer: letter ?? question.correctAnswer ?? undefined, explanation: result.text, type: question.type });
    await prisma.question.update({
      where: { id: question.id },
      data: {
        explanation: result.text,
        ...(letter ? { correctAnswer: letter } : {}),
        tags: Array.from(new Set([...question.tags.filter((t) => t !== TAG_NO_SOLUTION), TAG_SOLUTION_FROM_PAGE])),
        ...(copiedBefore && !letter ? {} : { reviewNotes: question.reviewNotes ? `${question.reviewNotes}\n${note}` : note }),
        verificationStatus: worstSeverity(qaIssues) === 'error' ? 'NEEDS_REVIEW' : 'STRUCTURALLY_VALID',
      },
    });
    updated++;
  }

  if (apply) {
    await recordAuditLog({
      actorId: auth.user.id,
      actorRole: 'ADMIN',
      action: 'BOOK_INLINE_SOLUTIONS_MATCHED',
      entityType: 'BookIngestionRun',
      entityId: run.id,
      metadata: { bookId: id, sections: sections.length, candidates: candidates.length, matched, updated, answersFilled, cleared, reasons },
      ...requestAuditContext(request),
    });
  }

  return NextResponse.json({
    apply,
    manifestConfirmed: true,
    sections: sections.length,
    candidates: candidates.length,
    matched,
    updated,
    answersFilled,
    cleared,
    reasons,
    detailsTruncated: details.length >= MAX_DETAILS,
    details,
  });
}
