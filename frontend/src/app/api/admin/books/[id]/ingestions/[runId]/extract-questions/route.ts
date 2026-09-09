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
import { worstSeverity } from '@/lib/question-qa';
import { snapToChapter } from '@/lib/chapter-classifier';

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

// One diagram/figure/chart region detected on a page that hasn't been
// attached to a saved Question yet, plus the page image its coordinates are
// relative to (needed later to actually crop it — see lib/page-image-crop.ts).
interface PendingDiagramRegion {
  ocrImagePath: string;
  region: DiagramRegion;
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
 * boundary since batches are only 5-10 pages. Also carries any diagram
 * regions detected on the pages contributing to this fragment, so a figure
 * printed on an earlier page in the chain isn't dropped once the fragment
 * resolves into saved Question(s).
 */
interface PendingCaseStudyFragment {
  startPage: number;
  lastPage: number;
  text: string;
  documentPageIds: string[];
  chainLength: number;
  diagramRegions: PendingDiagramRegion[];
}

function readPendingDiagramRegions(raw: unknown): PendingDiagramRegion[] {
  if (!Array.isArray(raw)) return [];
  const regions: PendingDiagramRegion[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== 'object') continue;
    const e = entry as Record<string, unknown>;
    const region = e.region;
    if (typeof e.ocrImagePath !== 'string' || !region || typeof region !== 'object') continue;
    const r = region as Record<string, unknown>;
    if (typeof r.x !== 'number' || typeof r.y !== 'number' || typeof r.width !== 'number' || typeof r.height !== 'number' || typeof r.type !== 'string') continue;
    regions.push({ ocrImagePath: e.ocrImagePath, region: { x: r.x, y: r.y, width: r.width, height: r.height, type: r.type } });
  }
  return regions;
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
    diagramRegions: readPendingDiagramRegions(f.diagramRegions),
  };
}

/**
 * Crops and attaches every accumulated diagram region to a just-saved
 * Question. Best-effort per region: a bad crop (a malformed path, a Python
 * failure, a region that clamps to nothing) is logged and skipped rather
 * than thrown — the Question itself is already committed by the time this
 * runs, and one missing image shouldn't cost the whole page's batch.
 */
async function attachDiagramImages(bookId: string, runId: string, questionId: string, regions: PendingDiagramRegion[]) {
  let index = 0;
  for (const { ocrImagePath, region } of regions) {
    const fileName = `${questionId}-${index}.jpg`;
    try {
      await cropPageRegion(bookId, runId, ocrImagePath, fileName, region);
      await prisma.questionImage.create({
        data: {
          questionId,
          imageUrl: `/api/admin/books/${bookId}/ingestions/${runId}/question-images/${fileName}`,
          imageType: region.type,
          orderIndex: index,
        },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      console.error(`Failed to attach diagram image ${index} for question ${questionId}: ${message}`);
    }
    index++;
  }
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

  const pages = await prisma.documentPage.findMany({
    where: {
      documentId: run.sourceDocumentId,
      pageNumber: { gte: Math.max(1, requestedStart) },
      pageImagePath: { not: null },
      ...(force ? {} : { status: { not: 'COMPLETED' } }),
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
    const unrendered = await prisma.documentPage.count({ where: { documentId: run.sourceDocumentId, pageImagePath: null } });
    const earliestFailed = await prisma.documentPage.findFirst({
      where: { documentId: run.sourceDocumentId, pageImagePath: { not: null }, status: 'FAILED' },
      orderBy: { pageNumber: 'asc' },
      select: { pageNumber: true },
    });
    const failedRemaining = await prisma.documentPage.count({ where: { documentId: run.sourceDocumentId, pageImagePath: { not: null }, status: 'FAILED' } });

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
      // figures on it.
      const pageRegions: PendingDiagramRegion[] = pageRaw.ocrImagePath
        ? (pageRaw.diagramRegions ?? []).map((region) => ({ ocrImagePath: pageRaw.ocrImagePath as string, region }))
        : [];

      const structured = await structurePageQuestions(textForStructuring);
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
          diagramRegions: stitching ? [...pendingFragment!.diagramRegions, ...pageRegions] : pageRegions,
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
      const accumulatedRegions = stitching ? [...pendingFragment!.diagramRegions, ...pageRegions] : pageRegions;
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

      for (const { question, contentHash, qaIssues } of structured) {
        if (seenHashes.has(contentHash)) {
          duplicateCount++;
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
        // Snap the LLM's raw topic guess to a canonical CBSE chapter name when
        // confident; otherwise keep its raw text rather than mis-filing it
        // under an unrelated chapter. Either way, link (or create) the
        // matching BookChapter row so this isn't just a free-text label.
        const rawTopic = question.topic.trim();
        const topic = rawTopic ? (snapToChapter(rawTopic, book.className) || rawTopic) : null;
        const bookChapterId = topic ? await findOrCreateBookChapter(id, topic, chapterCache) : null;
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

        // Diagram regions are page/chain-level (Mathpix's line_data has no
        // notion of "which structured question does this belong to"), so
        // they're only attributable when the page/chain resolved to exactly
        // one question — the case-study bundling case this was built for.
        // With more than one question on a page, attaching a shared region
        // to all of them would misattribute it, so it's dropped instead;
        // that's a known gap for a page with multiple ordinary questions
        // that each contain their own separate figure.
        if (structured.length === 1 && accumulatedRegions.length > 0) {
          await attachDiagramImages(id, run.id, created.id, accumulatedRegions);
        }
      }

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

  const notYetAttempted = await prisma.documentPage.count({
    where: { documentId: run.sourceDocumentId, pageImagePath: { not: null }, status: { notIn: ['COMPLETED', 'FAILED'] } },
  });
  const failedCount = await prisma.documentPage.count({
    where: { documentId: run.sourceDocumentId, pageImagePath: { not: null }, status: 'FAILED' },
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
    metadata: { bookId: id, pages: pages.map((p) => p.pageNumber), savedCount, duplicateCount, reviewCount, detectedCount, failures },
    ...requestAuditContext(request),
  });

  const lastPage = pages[pages.length - 1]?.pageNumber ?? requestedStart;
  return NextResponse.json({
    batch: { startPage: pages[0]?.pageNumber ?? requestedStart, endPage: lastPage, pagesProcessed: pages.length, detected: detectedCount, saved: savedCount, duplicates: duplicateCount, needsReview: reviewCount, failures },
    extractedQuestions: updatedRun.extractedQuestions,
    reviewRequired: updatedRun.reviewRequired,
    stage: updatedRun.stage,
    complete,
    nextStartPage: complete ? null : lastPage + 1,
  });
}
