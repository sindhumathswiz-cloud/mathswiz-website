import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getAuthenticatedUser } from '@/lib/auth-server';
import { recordAuditLog, requestAuditContext } from '@/lib/audit-log';
import { completeJsonPrompt } from '@/lib/structure-questions';
import { batchPages, buildRevisionPrompt, isNearDuplicate, isReadableReply, locateInPages, mathIsBalanced, parseRevisionItems, verbatimTier } from '@/lib/revision-content';
import { revisionContentHash } from '@/lib/revision-hash';
import { splitReferencePages } from '@/lib/revision-pages';
import { loadConfirmedChapters, sectionForPage } from '@/lib/book-manifest';

export const runtime = 'nodejs';
export const maxDuration = 240;

/**
 * Finds a chapter's reference content -- definitions, theorem statements,
 * formulas, properties, key points -- in the page text the question pipeline
 * already read, and saves it as DRAFT revision items.
 *
 * One batch of pages (a handful) per request, so the caller loops with
 * `nextStartPage`. This is an explicit admin action because it calls a language
 * model for every batch.
 *
 * The model only copies text it is shown. Each item is then scored against the
 * page it says it came from; only an exact match counts as verified, and every
 * item stays DRAFT until an admin approves it.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await getAuthenticatedUser(['ADMIN']);
  if ('error' in auth) return auth.error;
  const { id } = await params;
  const body = await request.json().catch(() => ({}));
  const chapterId = typeof body.chapterId === 'string' ? body.chapterId : '';
  if (!chapterId) return NextResponse.json({ error: 'chapterId is required' }, { status: 400 });

  const chapter = await prisma.bookChapter.findFirst({ where: { id: chapterId, bookId: id }, select: { id: true, name: true, startPage: true, endPage: true } });
  if (!chapter) return NextResponse.json({ error: 'Chapter not found' }, { status: 404 });
  if (!chapter.startPage || !chapter.endPage) return NextResponse.json({ error: 'This chapter has no page range yet. Confirm the chapter manifest first.' }, { status: 409 });

  const run = await prisma.bookIngestionRun.findFirst({ where: { bookId: id }, orderBy: { createdAt: 'desc' }, select: { id: true, sourceDocumentId: true, draftPurgedAt: true } });
  if (!run?.sourceDocumentId) return NextResponse.json({ error: 'No PDF has been ingested for this book' }, { status: 404 });
  if (run.draftPurgedAt) return NextResponse.json({ error: 'The extracted pages for this book were deleted after 60 days. Revision content can only be built from a current draft.' }, { status: 410 });

  const startPage = Number.isInteger(body.startPage) && body.startPage >= chapter.startPage ? body.startPage : chapter.startPage;
  const pages = await prisma.documentPage.findMany({
    where: { documentId: run.sourceDocumentId, pageNumber: { gte: startPage, lte: chapter.endPage } },
    orderBy: { pageNumber: 'asc' },
    select: { pageNumber: true, rawText: true },
  });
  const withText = pages.filter(page => page.rawText.trim().length > 0);
  if (withText.length === 0) {
    return NextResponse.json({ error: startPage === chapter.startPage ? 'No page text is available for this chapter yet. Run question extraction on the book first: revision content is read from the same page text.' : 'No more pages with text in this chapter.' }, { status: startPage === chapter.startPage ? 409 : 200 });
  }

  // Answer keys and worked solutions are copied exactly like theory is, so the verbatim
  // check cannot tell them apart: they are kept away from the model altogether.
  const confirmed = await loadConfirmedChapters(id);
  const { reference, skipped } = splitReferencePages(withText.map(page => ({ pageNumber: page.pageNumber, text: page.rawText })), confirmed);
  if (reference.length === 0) return NextResponse.json({ batch: null, nextStartPage: null, skippedPages: skipped });

  const [batch] = batchPages(reference);
  const batchNumbers = batch.map(page => page.pageNumber);
  const lastInBatch = batchNumbers[batchNumbers.length - 1];

  // Same provider chain as question structuring (Gemini first): this job is copying, and the
  // fallback models are the ones that paraphrase.
  const providersUsed = new Set<string>();
  const ask = async (group: typeof batch): Promise<string> => {
    const { system, user } = buildRevisionPrompt(group);
    const { content, provider } = await completeJsonPrompt(`${system}

### INPUT TEXT
${user}`, isReadableReply);
    providersUsed.add(provider);
    return content;
  };

  // The whole batch first. If the model cannot be reached, nothing is lost: report it and retry.
  let firstReply: string;
  try {
    firstReply = await ask(batch);
  } catch (error) {
    return NextResponse.json({ error: `The language model could not be reached for pages ${batchNumbers[0]}-${lastInBatch}: ${error instanceof Error ? error.message : 'unknown error'}. Nothing was saved for them; try again.` }, { status: 502 });
  }

  // A reply we cannot read is never an answer of "nothing here". A page dense with
  // LaTeX (a big table is the usual cause) can break the model's JSON, so unreadable
  // batches are retried one page at a time, and any page still unreadable is
  // reported instead of being silently skipped.
  const replies: Array<{ reply: string; pages: typeof batch }> = [];
  const unreadablePages: number[] = [];
  if (isReadableReply(firstReply)) {
    replies.push({ reply: firstReply, pages: batch });
  } else if (batch.length > 1) {
    for (const page of batch) {
      try {
        const single = await ask([page]);
        if (isReadableReply(single)) replies.push({ reply: single, pages: [page] });
        else unreadablePages.push(page.pageNumber);
      } catch {
        unreadablePages.push(page.pageNumber);
      }
    }
  } else {
    unreadablePages.push(batchNumbers[0]);
  }
  if (replies.length === 0) {
    return NextResponse.json({ error: `The language model's reply for pages ${batchNumbers[0]}-${lastInBatch} could not be read. Nothing was saved for them; try again.` }, { status: 502 });
  }
  const found = replies.flatMap(({ reply, pages: group }) => parseRevisionItems(reply, group.map(page => page.pageNumber)));
  const rows = found.map((item, index) => {
    // Graded against the page it is really on (a model often cites the wrong page
    // of a batch), and never as an exact match if its math is left unclosed: that
    // would render broken for a student.
    const located = locateInPages(item.body, batch, item.sourcePage);
    const balanced = mathIsBalanced(item.body);
    const score = balanced ? located.score : Math.min(located.score, 0.99);
    const tier = verbatimTier(score);
    return {
      bookId: id,
      chapterId: chapter.id,
      kind: item.kind,
      title: item.title,
      body: item.body,
      contentHash: revisionContentHash(item.body),
      sourcePage: located.sourcePage,
      verbatimScore: score,
      orderIndex: located.sourcePage * 100 + index,
      reviewNotes: !balanced
        ? 'The math in this item is not closed (an unmatched $), so it may not display correctly. Check it against the page.'
        : tier === 'EXACT' ? (sectionForPage(confirmed, located.sourcePage)
          // A page inside an exercise section is mostly questions and worked examples. An item
          // found there can be copied perfectly and still not be reference content, so it is
          // never approved in bulk.
          ? 'Found on a page the chapter manifest marks as exercises or examples. Check it is a general rule, not a worked example.'
          : null) : tier === 'CLOSE'
          ? 'Differs slightly from the source page text. Compare it with the page before approving.'
          : 'Does not match the source page text. It may be paraphrased or wrong; check it against the page.',
    };
  });

  // A re-run of a chapter often finds the same passage again, trimmed or extended by a few
  // words, which an exact-hash check cannot see. Skip anything already saved (including
  // items an admin archived: archiving is a decision, not a gap to refill) and anything
  // repeated within this batch.
  const existing = rows.length ? (await prisma.revisionItem.findMany({ where: { chapterId: chapter.id }, select: { body: true } })).map(item => item.body) : [];
  const fresh: typeof rows = [];
  for (const row of rows) {
    if (isNearDuplicate(row.body, [...existing, ...fresh.map(kept => kept.body)])) continue;
    fresh.push(row);
  }
  const created = fresh.length ? await prisma.revisionItem.createMany({ data: fresh, skipDuplicates: true }) : { count: 0 };
  const tiers = fresh.reduce((acc, row) => { acc[verbatimTier(row.verbatimScore)]++; return acc; }, { EXACT: 0, CLOSE: 0, MISMATCH: 0 });

  const nextStartPage = reference.some(page => page.pageNumber > lastInBatch) ? lastInBatch + 1 : null;
  await recordAuditLog({
    actorId: auth.user.id, actorRole: 'ADMIN', action: 'BOOK_REVISION_CONTENT_EXTRACTED', entityType: 'BookChapter', entityId: chapter.id,
    metadata: { bookId: id, pages: batchNumbers, found: found.length, saved: created.count, tiers, unreadablePages, skippedPages: skipped, providers: [...providersUsed] }, ...requestAuditContext(request),
  });

  return NextResponse.json({
    batch: { startPage: batchNumbers[0], endPage: lastInBatch, pages: batchNumbers.length, found: found.length, saved: created.count, duplicates: rows.length - created.count, ...tiers, unreadablePages, skippedPages: nextStartPage === null ? skipped : skipped.filter(page => page.pageNumber <= lastInBatch) },
    nextStartPage,
  });
}
