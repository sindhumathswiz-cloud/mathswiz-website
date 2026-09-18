import { NextResponse } from 'next/server';
import type { Prisma } from '@prisma/client';
import prisma from '@/lib/prisma';
import { getAuthenticatedUser } from '@/lib/auth-server';
import { recordAuditLog, requestAuditContext } from '@/lib/audit-log';
import { getPageRawText, structurePageQuestions } from '@/lib/extract-book-page';
import { isLikelyCaseStudyFragment } from '@/lib/case-study-fragment';
import { isLikelyIncompletePage } from '@/lib/incomplete-page-fragment';
import { cropPageRegion } from '@/lib/page-image-crop';
import type { DiagramRegion } from '@/lib/diagram-regions';
import { matchFiguresToQuestions } from '@/lib/figure-question-match';
import { worstSeverity } from '@/lib/question-qa';
import { snapToChapter } from '@/lib/chapter-classifier';
import { loadConfirmedChapters, chapterForPage, sectionForPage, answerKeySectionForPage, solutionsSectionForPage } from '@/lib/book-manifest';

export const runtime = 'nodejs';
export const maxDuration = 240;

const DEFAULT_BATCH_SIZE = 5;
const MAX_BATCH_SIZE = 10;

// A case-study passage split across a page boundary is stitched onto the
// next page's text before structuring (see PendingCaseStudyFragment below).
// Cap how many pages a single stitch can chain across so a systematic
// misclassification (the intro regex firing on an unrelated page) can't grow
// unbounded and swallow the rest of the book into one blob — 3 pages covers
// every real case study observed so far (a 1-page passage + up to 2 pages of
// sub-questions) with headroom to spare.
const MAX_FRAGMENT_CHAIN_PAGES = 3;

/**
 * Finds the BookChapter row for a detected topic name, or creates a
 * lightweight one on the fly (name + an auto-incrementing orderIndex; no
 * page range — that still needs a manual chapter-mapping pass, which is out
 * of scope for now). This is what turns the LLM's per-question "topic" guess
 * into a real `Question.bookChapterId` link instead of just free text.
 */
export async function findOrCreateBookChapter(bookId: string, name: string, cache: Map<string, string>): Promise<string | null> {
  const key = name.trim();
  if (!key) return null;
  if (cache.has(key)) return cache.get(key)!;

  const existing = await prisma.bookChapter.findFirst({ where: { bookId, name: key }, select: { id: true } });
  if (existing) {
    cache.set(key, existing.id);
    return existing.id;
  }

  const maxOrder = await prisma.bookChapter.aggregate({ where: { bookId }, _max: { orderIndex: true } });
  const orderIndex = (maxOrder._max.orderIndex ?? 0) + 1;
  try {
    const created = await prisma.bookChapter.create({ data: { bookId, name: key, orderIndex } });
    cache.set(key, created.id);
    return created.id;
  } catch {
    // Unique constraint race — a concurrent extraction batch created this
    // chapter (or claimed this orderIndex) first. Re-fetch by name rather
    // than failing the whole page over a chapter that now exists.
    const retried = await prisma.bookChapter.findFirst({ where: { bookId, name: key }, select: { id: true } });
    if (retried) {
      cache.set(key, retried.id);
      return retried.id;
    }
    return null;
  }
}

// Tags applied to a DRAFT question at extraction time based on
// CanonicalQuestion.explanationType, so a question that has no real worked
// solution is findable as its own review queue ("process these with AI
// later") instead of being indistinguishable from a fully-solved question
// until someone opens it. Deliberately a `tags` entry rather than a new
// Question column -- tags is a pre-existing array field, so this needs no
// schema migration.
const TAG_NO_SOLUTION = 'Questions without Solutions';
const TAG_HINT_AVAILABLE = 'Hint Available';

function deriveExplanationTags(explanationType: 'FULL' | 'HINT' | 'NONE'): string[] {
  if (explanationType === 'HINT') return [TAG_NO_SOLUTION, TAG_HINT_AVAILABLE];
  if (explanationType === 'NONE') return [TAG_NO_SOLUTION];
  return [];
}

/**
 * A page (or run of pages) still waiting to be joined with more text from a
 * following page before it's structured — either a CASE_STUDY passage
 * waiting for its sub-questions (case-study-fragment.ts), or a page whose
 * structured output looks incomplete for some other reason: nothing was
 * extracted from real text, or a lone question's math got cut off mid-block
 * (incomplete-page-fragment.ts). Persisted on BookIngestionRun.providerConfig
 * (no schema migration needed) so it survives across separate batch calls,
 * not just within one loop iteration — a stitch can straddle a batch
 * boundary since batches are only 5-10 pages. Also carries the PageFigure
 * ids already captured (see capturePageFigures below) for the pages
 * contributing to this fragment, so a figure printed on an earlier page in
 * the chain gets assigned once the fragment resolves into a saved Question.
 */
interface PendingCaseStudyFragment {
  startPage: number;
  lastPage: number;
  text: string;
  documentPageIds: string[];
  chainLength: number;
  pageFigureIds: string[];
}

function readPendingFragment(providerConfig: unknown): PendingCaseStudyFragment | null {
  if (!providerConfig || typeof providerConfig !== 'object' || Array.isArray(providerConfig)) return null;
  const raw = (providerConfig as Record<string, unknown>).pendingCaseStudyFragment;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const f = raw as Record<string, unknown>;
  if (typeof f.startPage !== 'number' || typeof f.lastPage !== 'number' || typeof f.text !== 'string') return null;
  return {
    startPage: f.startPage,
    lastPage: f.lastPage,
    text: f.text,
    documentPageIds: Array.isArray(f.documentPageIds) ? f.documentPageIds.filter((x): x is string => typeof x === 'string') : [],
    chainLength: typeof f.chainLength === 'number' ? f.chainLength : 1,
    pageFigureIds: Array.isArray(f.pageFigureIds) ? f.pageFigureIds.filter((x): x is string => typeof x === 'string') : [],
  };
}

/**
 * Crops and saves EVERY figure region Mathpix detected on this page as its
 * own PageFigure row -- unassigned (questionId: null) -- regardless of how
 * many questions the page turns out to produce or whether it becomes part of
 * a multi-page fragment. Runs once per page, right after OCR.
 *
 * This is the fix for the old "dropped wholesale" failure mode: previously a
 * region was only ever cropped once matched to exactly one question, so an
 * unmatched figure (a page the matcher couldn't place, or a genuine
 * detection miss on a chapter with dense multi-question pages) was gone
 * forever with no record it had ever existed. Now every detected figure is
 * captured; matching (below) only decides which question's row it links to,
 * and an unplaced one stays visible for manual review instead of vanishing.
 *
 * Best-effort per region, same reasoning as before: a bad crop (a malformed
 * path, a Python failure, a region that clamps to nothing) is logged and
 * skipped rather than thrown. Returns the created row ids in the SAME ORDER
 * as `regions`, with `null` in a slot whose crop failed.
 */
async function capturePageFigures(
  bookId: string,
  runId: string,
  documentPageId: string,
  pageNumber: number,
  ocrImagePath: string,
  regions: DiagramRegion[],
): Promise<Array<string | null>> {
  const ids: Array<string | null> = [];
  let index = 0;
  for (const region of regions) {
    const fileName = `pf-${documentPageId}-${index}.jpg`;
    try {
      await cropPageRegion(bookId, runId, ocrImagePath, fileName, region);
      const created = await prisma.pageFigure.create({
        data: {
          bookId,
          documentPageId,
          pageNumber,
          x: region.x,
          y: region.y,
          width: region.width,
          height: region.height,
          imageType: region.type,
          imageUrl: `/api/admin/books/${bookId}/ingestions/${runId}/question-images/${fileName}`,
          orderIndex: index,
        },
        select: { id: true },
      });
      ids.push(created.id);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      console.error(`Failed to capture figure ${index} on page ${pageNumber}: ${message}`);
      ids.push(null);
    }
    index++;
  }
  return ids;
}

/**
 * Batch-extracts Question rows (status DRAFT) from already-rendered pages of a
 * BookIngestionRun: page raw text (native or Mathpix OCR, see
 * lib/extract-book-page.ts) -> LLM structuring -> normalization -> QA check ->
 * content-hash dedup -> save. This is the step that was previously missing:
 * render-pages and benchmarks populate DocumentPage/PageExtractionBenchmark,
 * but nothing turned that into actual questions. Mirrors render-pages' batch
 * shape (startPage/batchSize -> nextStartPage/complete) so the admin UI can
 * loop the same way it already loops page rendering.
 *
 * Pages are structured one at a time, EXCEPT for a CASE_STUDY passage that is
 * still incomplete on the page it was found on (its sub-questions print on
 * the next page in the source book) — see isLikelyCaseStudyFragment and
 * PendingCaseStudyFragment. That case's raw text is held and prepended to the
 * following page's text before structuring, so the passage + its
 * sub-questions + their combined solution are saved as ONE Question row with
 * sourcePageStart/sourcePageEnd spanning the full range, instead of a broken
 * passage-only orphan plus a sub-questions-only row missing its own context.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string; runId: string }> }) {
  const auth = await getAuthenticatedUser(['ADMIN']);
  if ('error' in auth) return auth.error;
  const { id, runId } = await params;
  const body = await request.json().catch(() => ({}));
  const requestedStart = Number.isInteger(body.startPage) ? body.startPage : 1;
  const requestedBatchSize = Number.isInteger(body.batchSize) ? body.batchSize : DEFAULT_BATCH_SIZE;
  const batchSize = Math.min(MAX_BATCH_SIZE, Math.max(1, requestedBatchSize));
  const force = body.force === true;
  // Optional upper page bound -- lets the manifest UI extract one chapter at a
  // time instead of the whole book.
  const endPage: number | null = Number.isInteger(body.endPage) ? body.endPage : null;

  const run = await prisma.bookIngestionRun.findFirst({
    where: { id: runId, bookId: id },
    select: { id: true, sourceDocumentId: true, totalPages: true, extractedQuestions: true, reviewRequired: true, providerConfig: true },
  });
  if (!run) return NextResponse.json({ error: 'Book ingestion run not found' }, { status: 404 });
  if (!run.sourceDocumentId || !run.totalPages) {
    return NextResponse.json({ error: 'Render this book\'s pages before extracting questions' }, { status: 409 });
  }

  const book = await prisma.book.findUnique({ where: { id }, select: { className: true, subject: true } });
  if (!book) return NextResponse.json({ error: 'Book not found' }, { status: 404 });

  // Confirmed chapter manifest (if any). Loaded up front because it also
  // decides which already-COMPLETED pages are worth a second pass (below).
  // When a page falls inside a confirmed chapter, its questions are filed
  // under that chapter directly (not the LLM's per-question topic guess);
  // when it falls inside a confirmed *section* the provider fallback chain is
  // told to distrust an empty result (p.479 fix).
  const confirmedChapters = await loadConfirmedChapters(id);

  // On a per-chapter extraction (endPage set) that isn't a full forced
  // re-run, also re-pick pages that were marked COMPLETED with ZERO questions
  // but sit inside a confirmed question section. Those are almost always a
  // silent miss from an earlier run -- a provider returned parseable-empty
  // under load, before any manifest existed to distrust it -- not a
  // genuinely empty page. Bounded to the chapter's own page window; dedup and
  // the distrustEmpty provider chain keep the re-pass safe and cheap. Without
  // this, "Extract this chapter" skips every such page as already-COMPLETED
  // and the chapter stays permanently under-extracted unless the admin knows
  // to hit the heavier full "Re-extract (force)".
  // Pages inside a confirmed chapter that are a pure answer-key or
  // detailed-solutions listing (in a section's key/solutions range, and NOT
  // in any question section) are NOT question pages. Running the LLM over one
  // produces junk rows -- an "Answers 1.(a) 2.(c) ..." block, or worked
  // solutions with the question restated, get mis-structured as optionless
  // duplicate questions of the real ones a few pages back. The manifest knows
  // exactly where those pages are, so skip them here; match-answer-keys /
  // match-detailed-solutions consume them instead.
  const manifestListingPages: number[] = [];
  const recoverableEmptyPages: number[] = [];
  for (let p = Math.max(1, requestedStart); p <= (endPage ?? run.totalPages); p++) {
    if (!chapterForPage(confirmedChapters, p)) continue;
    if (sectionForPage(confirmedChapters, p)) {
      // A per-chapter re-run (endPage set, not force) also re-picks pages a
      // confirmed question section covers that were left COMPLETED with zero
      // questions -- almost always a silent miss from an earlier run (a
      // provider returned parseable-empty under load, before any manifest
      // existed to distrust it). Dedup + the distrustEmpty provider chain
      // keep the re-pass safe and cheap.
      if (!force && endPage != null) recoverableEmptyPages.push(p);
    } else if (answerKeySectionForPage(confirmedChapters, p) || solutionsSectionForPage(confirmedChapters, p)) {
      manifestListingPages.push(p);
    }
  }

  const pageWindow = {
    gte: Math.max(1, requestedStart),
    ...(endPage != null ? { lte: endPage } : {}),
    ...(manifestListingPages.length ? { notIn: manifestListingPages } : {}),
  };
  const pages = await prisma.documentPage.findMany({
    where: {
      documentId: run.sourceDocumentId,
      pageNumber: pageWindow,
      pageImagePath: { not: null },
      ...(force
        ? {}
        : recoverableEmptyPages.length
          ? {
              OR: [
                { status: { not: 'COMPLETED' as const } },
                { status: 'COMPLETED' as const, detectedQuestions: 0, pageNumber: { in: recoverableEmptyPages } },
              ],
            }
          : { status: { not: 'COMPLETED' as const } }),
    },
    orderBy: { pageNumber: 'asc' },
    take: batchSize,
    select: { id: true, pageNumber: true, nativeText: true, pageImagePath: true, processedImagePath: true, layoutData: true },
  });

  if (pages.length === 0) {
    // Nothing left going FORWARD from requestedStart — but that alone
    // doesn't mean the run is done: a page earlier in the book (already
    // passed by this forward-only scan) may still be FAILED and retriable.
    // Loop back to the earliest such page instead of silently reporting
    // success with pages missing (the bug this replaced). Bounded by
    // MAX_FAILED_RETRY_CYCLES via providerConfig.failureRetryCycles so a
    // page that fails deterministically every time can't spin forever.
    // When extracting a single chapter (endPage set), "done" and "retriable
    // failures" are judged within that window only.
    const windowPageFilter = {
      ...(endPage != null ? { gte: Math.max(1, requestedStart), lte: endPage } : {}),
      ...(manifestListingPages.length ? { notIn: manifestListingPages } : {}),
    };
    const windowFilter = Object.keys(windowPageFilter).length ? { pageNumber: windowPageFilter } : {};
    // Pages in the window that are already COMPLETED -- so the UI can say
    // "already extracted, use force to redo" rather than a bare "0 saved".
    const alreadyExtracted = await prisma.documentPage.count({ where: { documentId: run.sourceDocumentId, pageImagePath: { not: null }, status: 'COMPLETED', ...windowFilter } });
    const unrendered = await prisma.documentPage.count({ where: { documentId: run.sourceDocumentId, pageImagePath: null, ...windowFilter } });
    const earliestFailed = await prisma.documentPage.findFirst({
      where: { documentId: run.sourceDocumentId, pageImagePath: { not: null }, status: 'FAILED', ...windowFilter },
      orderBy: { pageNumber: 'asc' },
      select: { pageNumber: true },
    });
    const failedRemaining = await prisma.documentPage.count({ where: { documentId: run.sourceDocumentId, pageImagePath: { not: null }, status: 'FAILED', ...windowFilter } });

    const existingProviderConfig = run.providerConfig && typeof run.providerConfig === 'object' && !Array.isArray(run.providerConfig)
      ? (run.providerConfig as Record<string, unknown>)
      : {};
    const cycles = typeof existingProviderConfig.failureRetryCycles === 'number' ? existingProviderConfig.failureRetryCycles : 0;
    const MAX_FAILED_RETRY_CYCLES = 3;

    if (unrendered === 0 && !earliestFailed) {
      // Genuinely done: every page reached COMPLETED. Reset the cycle
      // counter so a future re-extraction (e.g. after new pages are added)
      // starts its own retry budget fresh.
      await prisma.bookIngestionRun.update({ where: { id: run.id }, data: { providerConfig: { ...existingProviderConfig, failureRetryCycles: 0 } as Prisma.InputJsonValue } });
      return NextResponse.json({
        batch: { startPage: requestedStart, pagesProcessed: 0, detected: 0, saved: 0, duplicates: 0, needsReview: 0, failures: [] },
        extractedQuestions: run.extractedQuestions,
        reviewRequired: run.reviewRequired,
        complete: true,
        alreadyExtracted,
        nextStartPage: null,
      });
    }

    if (earliestFailed && cycles < MAX_FAILED_RETRY_CYCLES) {
      await prisma.bookIngestionRun.update({ where: { id: run.id }, data: { providerConfig: { ...existingProviderConfig, failureRetryCycles: cycles + 1 } as Prisma.InputJsonValue } });
      return NextResponse.json({
        batch: { startPage: requestedStart, pagesProcessed: 0, detected: 0, saved: 0, duplicates: 0, needsReview: 0, failures: [] },
        extractedQuestions: run.extractedQuestions,
        reviewRequired: run.reviewRequired,
        complete: false,
        nextStartPage: earliestFailed.pageNumber,
      });
    }

    // Either nothing is FAILED (just unrendered pages, which this route
    // can't fix — render-pages is a separate step) or we've already spent
    // the retry budget on pages that keep failing. Report honestly rather
    // than looping forever or silently declaring success.
    return NextResponse.json({
      batch: { startPage: requestedStart, pagesProcessed: 0, detected: 0, saved: 0, duplicates: 0, needsReview: 0, failures: [] },
      extractedQuestions: run.extractedQuestions,
      reviewRequired: run.reviewRequired,
      complete: unrendered === 0 && failedRemaining === 0,
      permanentFailures: failedRemaining,
      nextStartPage: null,
    });
  }

  await prisma.bookIngestionRun.update({ where: { id: run.id }, data: { status: 'IN_PROGRESS', stage: 'QUESTION_EXTRACTION', errorMessage: null } });

  let savedCount = 0;
  let duplicateCount = 0;
  let reviewCount = 0;
  let detectedCount = 0;
  let manifestFiledCount = 0;
  let distrustEmptyPages = 0;
  // Figure regions attached to a specific question by vertical position on a
  // multi-question page (as opposed to the whole-page single-question case).
  let figuresMatchedToQuestion = 0;
  // Pages inside a confirmed question section that STILL produced zero
  // questions after the full provider chain — surfaced in the response and
  // audit log so a silent under-extraction is visible (and re-checkable)
  // rather than looking identical to a genuinely blank page.
  const emptySectionPages: number[] = [];
  const failures: string[] = [];
  // Cross-run + intra-batch dedupe: skip content that already exists as an
  // APPROVED question anywhere, or that this book already has on file under
  // any status — re-running extraction on a page must not create duplicate DRAFTs.
  const seenHashes = new Set<string>();
  // Per-request cache so repeated topics within this batch don't each trigger
  // a find-or-create round trip.
  const chapterCache = new Map<string, string>();

  // A fragment left over from a previous batch only applies if this batch's
  // first page is literally the next page after it — otherwise the run was
  // resumed out of order (a manual startPage jump, or a `force` re-run) and
  // stitching two non-adjacent pages together would corrupt the content.
  let pendingFragment = readPendingFragment(run.providerConfig);
  if (pendingFragment && pendingFragment.lastPage + 1 !== pages[0]?.pageNumber) {
    pendingFragment = null;
  }

  for (const page of pages) {
    const layout = page.layoutData && typeof page.layoutData === 'object' && !Array.isArray(page.layoutData)
      ? (page.layoutData as { requiresVisionSegmentation?: boolean })
      : {};
    try {
      const pageRaw = await getPageRawText({
        pageNumber: page.pageNumber,
        nativeText: page.nativeText,
        pageImagePath: page.pageImagePath,
        processedImagePath: page.processedImagePath,
        requiresVisionSegmentation: Boolean(layout.requiresVisionSegmentation),
      });

      const stitching = pendingFragment && pendingFragment.lastPage + 1 === page.pageNumber;
      const textForStructuring = stitching ? `${pendingFragment!.text}\n\n${pageRaw.rawText}` : pageRaw.rawText;
      const chainLength = (stitching ? pendingFragment!.chainLength : 0) + 1;
      // pageRaw.diagramRegions/ocrImagePath are only populated when this
      // page was OCR'd (MATHPIX_OCR) — a NATIVE_TEXT page has neither, so
      // this is [] in that (common) case, same as an OCR'd page with no
      // figures on it. Captured (cropped + saved as unassigned PageFigure
      // rows) immediately, before we know how many questions this page
      // produces or whether it joins a fragment -- see capturePageFigures.
      const pageRegions: DiagramRegion[] = pageRaw.diagramRegions ?? [];
      const thisPageFigureIds: Array<string | null> = (pageRegions.length > 0 && pageRaw.ocrImagePath)
        ? await capturePageFigures(id, run.id, page.id, page.pageNumber, pageRaw.ocrImagePath, pageRegions)
        : [];

      // If this page sits inside a confirmed manifest section (a known
      // questions region), tell the provider chain not to trust a
      // parseable-but-empty result -- that's the p.479 failure mode.
      const distrustEmpty = Boolean(sectionForPage(confirmedChapters, page.pageNumber));
      if (distrustEmpty) distrustEmptyPages++;

      const structured = await structurePageQuestions(textForStructuring, { distrustEmpty });
      const stillFragment = chainLength < MAX_FRAGMENT_CHAIN_PAGES
        && (isLikelyCaseStudyFragment(textForStructuring, structured.map((s) => s.question))
          || isLikelyIncompletePage(textForStructuring, structured));

      if (stillFragment) {
        // Hold this (possibly already-stitched) passage and try again with
        // the next page — no question is saved for this page yet, and it's
        // still marked COMPLETED below so the batch loop doesn't stall on it.
        pendingFragment = {
          startPage: stitching ? pendingFragment!.startPage : page.pageNumber,
          lastPage: page.pageNumber,
          text: textForStructuring,
          documentPageIds: stitching ? [...pendingFragment!.documentPageIds, page.id] : [page.id],
          chainLength,
          pageFigureIds: [...(stitching ? pendingFragment!.pageFigureIds : []), ...thisPageFigureIds.filter((x): x is string => x != null)],
        };
        await prisma.documentPage.update({
          where: { id: page.id },
          data: {
            status: 'COMPLETED',
            rawMarkdown: pageRaw.rawText,
            rawText: pageRaw.rawText,
            detectedQuestions: 0,
            ocrProvider: pageRaw.provider,
            ocrConfidence: pageRaw.ocrConfidence,
            errorMessage: null,
          },
        });
        continue;
      }

      const sourcePageStart = stitching ? pendingFragment!.startPage : page.pageNumber;
      const sourcePageEnd = page.pageNumber;
      const sourceDocumentPageIds = stitching ? [...pendingFragment!.documentPageIds, page.id] : [page.id];
      const accumulatedFigureIds = [
        ...(stitching ? pendingFragment!.pageFigureIds : []),
        ...thisPageFigureIds.filter((x): x is string => x != null),
      ];
      pendingFragment = null;

      detectedCount += structured.length;

      if (structured.length > 0) {
        const hashes = structured.map((s) => s.contentHash);
        const existing = await prisma.question.findMany({
          where: { contentHash: { in: hashes }, OR: [{ bookId: id }, { status: 'APPROVED' }] },
          select: { contentHash: true },
        });
        for (const e of existing) if (e.contentHash) seenHashes.add(e.contentHash);
      }

      // Which of this page's captured figures belong to which question. For
      // a single-question page/chain every accumulated figure is that
      // question's (below). For a multi-question SINGLE page, place each
      // figure under the question nearest above it, by the OCR text-line
      // positions — pages whose figures used to be dropped wholesale. A
      // stitched fragment chain spans multiple page images whose coordinates
      // aren't comparable, so it keeps the single-question whole-chain path.
      const regionsByQuestion = (!stitching && structured.length > 1 && pageRegions.length > 0)
        ? matchFiguresToQuestions(
            pageRegions,
            pageRaw.textLines,
            structured.map((s) => ({ printedNumber: s.question.printedNumber, content: s.question.questionContent })),
          )
        : new Map<number, DiagramRegion[]>();

      // Resolved once per question, up front, so a duplicate-skipped question
      // (below) can still backfill its figures onto the row it duplicates --
      // otherwise re-running extraction on a chapter that already has its
      // questions (e.g. to pick up figures under this capture-all pipeline
      // for the first time) would silently drop every figure on a page whose
      // questions all already exist.
      const figureIdsPerQuestion: string[][] = structured.map((_, index) => (
        structured.length === 1
          ? accumulatedFigureIds
          : (regionsByQuestion.get(index) ?? [])
              .map((region) => {
                const regionIndex = pageRegions.indexOf(region);
                return regionIndex >= 0 ? thisPageFigureIds[regionIndex] : null;
              })
              .filter((x): x is string => x != null)
      ));

      for (const [index, { question, contentHash, qaIssues }] of structured.entries()) {
        const figureIdsForThisQuestion = figureIdsPerQuestion[index];
        if (seenHashes.has(contentHash)) {
          duplicateCount++;
          // This question already exists (this page reproduced its exact
          // content) -- if figures were placed on it, and the existing row
          // has none yet, link them there instead of dropping them. Never
          // re-add on top of images it already has (a repeat re-run
          // shouldn't keep piling on duplicates).
          if (figureIdsForThisQuestion.length > 0) {
            const existing = await prisma.question.findFirst({
              where: { contentHash, OR: [{ bookId: id }, { status: 'APPROVED' }] },
              select: { id: true, _count: { select: { pageFigures: true } } },
            });
            if (existing && existing._count.pageFigures === 0) {
              await prisma.pageFigure.updateMany({
                where: { id: { in: figureIdsForThisQuestion } },
                data: { questionId: existing.id, matchedAutomatically: true },
              });
              figuresMatchedToQuestion += figureIdsForThisQuestion.length;
            }
          }
          continue;
        }
        seenHashes.add(contentHash);
        const severity = worstSeverity(qaIssues);
        if (severity === 'error') reviewCount++;
        // Deterministic QA-derived confidence (0-100): start clean, dock points
        // per issue. Not the same signal as a vision model's own confidence
        // score (Phase 3 will reconcile the two under `extractionConfidence`).
        const confidence = Math.max(
          0,
          100 - qaIssues.filter((i) => i.severity === 'error').length * 30 - qaIssues.filter((i) => i.severity === 'warn').length * 10,
        );
        // A confirmed manifest chapter covering this question's source page is
        // ground truth -- file the question under it directly and skip the
        // LLM topic guess entirely. Otherwise: snap the LLM's raw topic guess
        // to a canonical CBSE chapter name when confident; else keep its raw
        // text rather than mis-filing it. Either way, link (or create) the
        // BookChapter row so this isn't just a free-text label.
        const manifestChapter = chapterForPage(confirmedChapters, sourcePageStart);
        let topic: string | null;
        let bookChapterId: string | null;
        if (manifestChapter) {
          topic = manifestChapter.topic || manifestChapter.name;
          bookChapterId = manifestChapter.id;
          manifestFiledCount++;
        } else {
          const rawTopic = question.topic.trim();
          topic = rawTopic ? (snapToChapter(rawTopic, book.className) || rawTopic) : null;
          bookChapterId = topic ? await findOrCreateBookChapter(id, topic, chapterCache) : null;
        }
        // Merge the model's own tags with the ones derived from
        // explanationType, deduped -- a question the model already tagged
        // "Hint Available" itself (unlikely, but possible) shouldn't end up
        // listed twice.
        const tags = Array.from(new Set([...(question.tags ?? []), ...deriveExplanationTags(question.explanationType)]));
        const created = await prisma.question.create({
          data: {
            content: question.questionContent,
            contentHash,
            options: question.options,
            correctAnswer: question.correctAnswer || null,
            explanation: question.explanation || null,
            type: question.type,
            difficulty: question.difficulty,
            subject: book.subject,
            class: book.className,
            topic,
            subTopic: question.method.trim() || null,
            printedNumber: (question.printedNumber || '').trim() || null,
            tags,
            status: 'DRAFT',
            scope: 'PUBLIC',
            provenance: 'BOOK_SOURCED',
            originalRawText: textForStructuring,
            createdById: auth.user.id,
            bookId: id,
            bookChapterId,
            sourcePageStart,
            sourcePageEnd,
            sourceLocator: { ingestionRunId: run.id, documentPageIds: sourceDocumentPageIds, ocrProvider: pageRaw.provider } as Prisma.InputJsonValue,
            confidence,
            verificationStatus: severity === 'error' ? 'NEEDS_REVIEW' : 'STRUCTURALLY_VALID',
          },
        });
        savedCount++;

        // Link this question to its already-captured PageFigure rows (every
        // figure on the page was cropped and saved up front, unassigned --
        // see capturePageFigures). A single-question page or a resolved
        // fragment chain: every accumulated figure is this question's. A
        // multi-question page: only the figures the vertical-position match
        // assigned to THIS question (figure-question-match.ts) — the rest
        // go to their own questions, or stay unassigned (still visible for
        // manual review via the figures API) if they can't be placed, e.g. a
        // figure above the first question, belonging to one carried over
        // from the previous page.
        if (structured.length > 1) figuresMatchedToQuestion += figureIdsForThisQuestion.length;
        if (figureIdsForThisQuestion.length > 0) {
          await prisma.pageFigure.updateMany({
            where: { id: { in: figureIdsForThisQuestion } },
            data: { questionId: created.id, matchedAutomatically: true },
          });
        }
      }

      if (distrustEmpty && structured.length === 0) emptySectionPages.push(page.pageNumber);

      await prisma.documentPage.update({
        where: { id: page.id },
        data: {
          status: 'COMPLETED',
          rawMarkdown: pageRaw.rawText,
          rawText: pageRaw.rawText,
          detectedQuestions: structured.length,
          ocrProvider: pageRaw.provider,
          ocrConfidence: pageRaw.ocrConfidence,
          errorMessage: null,
        },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Question extraction failed';
      failures.push(`Page ${page.pageNumber}: ${message}`);
      await prisma.documentPage.update({ where: { id: page.id }, data: { status: 'FAILED', errorMessage: message.slice(0, 2000) } });
      // Don't carry a fragment across a page that errored out — the chain's
      // continuity assumption (this page's text picks up right where the
      // last one left off) no longer holds once a page failed to extract.
      pendingFragment = null;
    }
  }

  const completionPageFilter = {
    ...(endPage != null ? { gte: Math.max(1, requestedStart), lte: endPage } : {}),
    ...(manifestListingPages.length ? { notIn: manifestListingPages } : {}),
  };
  const completionWindow = Object.keys(completionPageFilter).length ? { pageNumber: completionPageFilter } : {};
  const notYetAttempted = await prisma.documentPage.count({
    where: { documentId: run.sourceDocumentId, pageImagePath: { not: null }, status: { notIn: ['COMPLETED', 'FAILED'] }, ...completionWindow },
  });
  const failedCount = await prisma.documentPage.count({
    where: { documentId: run.sourceDocumentId, pageImagePath: { not: null }, status: 'FAILED', ...completionWindow },
  });
  const attempted = await prisma.documentPage.count({
    where: { documentId: run.sourceDocumentId, status: { in: ['COMPLETED', 'FAILED'] } },
  });
  // A FAILED page counts as "attempted", so checking attempted >= totalPages
  // alone declared the run complete as soon as every page had been touched
  // ONCE — even with hundreds still FAILED and never successfully retried.
  // That silently truncated retries after a systemic failure (e.g. the
  // Mathpix include_line_data bug, which failed 100% of pages in one run):
  // the client's loop stopped after a single forward pass, reporting success
  // while most of the book was never actually extracted. Completion now
  // requires every page to have reached COMPLETED specifically.
  const complete = notYetAttempted === 0 && failedCount === 0;
  const progress = Math.min(90, 25 + (attempted / Math.max(1, run.totalPages)) * 65);

  const existingProviderConfig = run.providerConfig && typeof run.providerConfig === 'object' && !Array.isArray(run.providerConfig)
    ? (run.providerConfig as Record<string, unknown>)
    : {};

  const updatedRun = await prisma.bookIngestionRun.update({
    where: { id: run.id },
    data: {
      extractedQuestions: { increment: savedCount },
      reviewRequired: { increment: reviewCount },
      progress,
      // Solution matching and mathematical verification (Phase 2/3 of the
      // digitization roadmap) aren't implemented yet — once every rendered
      // page has been attempted, the honest next step is human review of the
      // DRAFT questions just created, not an unimplemented automated stage.
      stage: complete ? 'REVIEW_READY' : 'QUESTION_EXTRACTION',
      status: complete ? 'COMPLETED' : 'IN_PROGRESS',
      completedAt: complete ? new Date() : null,
      providerConfig: {
        ...existingProviderConfig,
        pendingCaseStudyFragment: pendingFragment,
        // Genuinely done in this same forward pass (no FAILED pages hit) —
        // reset the retry-cycle budget so a later re-extraction starts fresh.
        ...(complete ? { failureRetryCycles: 0 } : {}),
      } as Prisma.InputJsonValue,
    },
    select: { extractedQuestions: true, reviewRequired: true, stage: true },
  });

  await recordAuditLog({
    actorId: auth.user.id,
    actorRole: 'ADMIN',
    action: 'BOOK_PAGE_BATCH_QUESTIONS_EXTRACTED',
    entityType: 'BookIngestionRun',
    entityId: run.id,
    metadata: { bookId: id, pages: pages.map((p) => p.pageNumber), savedCount, duplicateCount, reviewCount, detectedCount, manifestFiledCount, distrustEmptyPages, emptySectionPages, skippedListingPages: manifestListingPages, figuresMatchedToQuestion, failures },
    ...requestAuditContext(request),
  });

  const lastPage = pages[pages.length - 1]?.pageNumber ?? requestedStart;
  const reachedWindowEnd = endPage != null && lastPage >= endPage;
  return NextResponse.json({
    batch: { startPage: pages[0]?.pageNumber ?? requestedStart, endPage: lastPage, pagesProcessed: pages.length, detected: detectedCount, saved: savedCount, duplicates: duplicateCount, needsReview: reviewCount, manifestFiled: manifestFiledCount, distrustEmptyPages, emptySectionPages, skippedListingPages: manifestListingPages, figuresMatchedToQuestion, failures },
    extractedQuestions: updatedRun.extractedQuestions,
    reviewRequired: updatedRun.reviewRequired,
    stage: updatedRun.stage,
    complete: complete || reachedWindowEnd,
    nextStartPage: (complete || reachedWindowEnd) ? null : lastPage + 1,
  });
}
