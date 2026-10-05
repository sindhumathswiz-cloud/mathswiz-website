import { Prisma } from '@prisma/client';
import prisma from './prisma';
import { removePrivateImage } from './book-storage';

/**
 * Extracted book pages are a DRAFT BUFFER: the page images, OCR text, text
 * layer and provider benchmarks that let an admin check and correct what
 * extraction produced. They are kept for DRAFT_RETENTION_DAYS and then purged.
 *
 * What a purge touches -- and what it deliberately does not:
 *  - Cleared: each page's image files, OCR/native text, text layer, layout data
 *    and the run's provider benchmarks.
 *  - Kept: the DocumentPage ROWS (emptied). PageFigure rows cascade from them,
 *    and those link approved questions to their cropped figures -- deleting a
 *    row would silently detach a live question's diagram.
 *  - Kept: every Question (standing rule: question data is archived, never
 *    hard-deleted), the cropped question-images, the original PDF, and the
 *    ingestion run itself -- so a book can be re-rendered from the PDF.
 *  - Kept: RevisionItem rows (definitions, theorems and formulas saved for
 *    revision sheets). They are the product of the extraction, not the buffer,
 *    which is why they are saved at all: the page text they came from goes in 60
 *    days, they do not.
 */

export const DRAFT_RETENTION_DAYS = 60;
const DAY_MS = 24 * 60 * 60 * 1000;

export function draftExpiryFrom(from: Date = new Date()): Date {
  return new Date(from.getTime() + DRAFT_RETENTION_DAYS * DAY_MS);
}

/** Whole days left, rounded up so "expires today" reads as 1 until it is actually due. */
export function daysUntilExpiry(expiresAt: Date, now: Date = new Date()): number {
  return Math.ceil((expiresAt.getTime() - now.getTime()) / DAY_MS);
}

/**
 * (Re)starts the retention clock: a run's draft lives DRAFT_RETENTION_DAYS from
 * its most recent render or extraction, and the clock only ever moves later
 * (a re-run never shortens what was promised). A run whose draft has already
 * been purged is left alone -- there is nothing left to keep.
 */
export async function startDraftClock(runId: string, now: Date = new Date()): Promise<Date | null> {
  const run = await prisma.bookIngestionRun.findUnique({ where: { id: runId }, select: { draftExpiresAt: true, draftPurgedAt: true } });
  if (!run || run.draftPurgedAt) return null;
  const proposed = draftExpiryFrom(now);
  if (run.draftExpiresAt && run.draftExpiresAt >= proposed) return run.draftExpiresAt;
  await prisma.bookIngestionRun.update({ where: { id: runId }, data: { draftExpiresAt: proposed } });
  return proposed;
}

export interface PurgeOutcome {
  runId: string;
  bookTitle: string;
  pagesCleared: number;
  filesRemoved: number;
  fileErrors: number;
  benchmarksRemoved: number;
}

async function purgeRun(run: { id: string; sourceDocumentId: string | null; book: { title: string } }, now: Date): Promise<PurgeOutcome> {
  const outcome: PurgeOutcome = { runId: run.id, bookTitle: run.book.title, pagesCleared: 0, filesRemoved: 0, fileErrors: 0, benchmarksRemoved: 0 };
  if (run.sourceDocumentId) {
    const pages = await prisma.documentPage.findMany({
      where: { documentId: run.sourceDocumentId },
      select: { pageImagePath: true, processedImagePath: true },
    });
    const files = [...new Set(pages.flatMap(page => [page.pageImagePath, page.processedImagePath]).filter((path): path is string => Boolean(path)))];
    // A file that is already gone must not stop the purge; one that fails for
    // another reason is counted so the caller can see the buffer was not fully
    // reclaimed, but the database side still clears (the images are unreachable
    // once no row points at them).
    for (const file of files) {
      try {
        await removePrivateImage(file);
        outcome.filesRemoved++;
      } catch {
        outcome.fileErrors++;
      }
    }
    const benchmarks = await prisma.pageExtractionBenchmark.deleteMany({ where: { ingestionRunId: run.id } });
    outcome.benchmarksRemoved = benchmarks.count;
    const cleared = await prisma.documentPage.updateMany({
      where: { documentId: run.sourceDocumentId },
      data: {
        rawMarkdown: '',
        rawText: '',
        nativeText: null,
        textLayer: Prisma.DbNull,
        layoutData: Prisma.DbNull,
        pageImagePath: null,
        processedImagePath: null,
        pageImageUrl: null,
        imageUrls: [],
        hasImages: false,
        ocrProvider: null,
        ocrConfidence: null,
      },
    });
    outcome.pagesCleared = cleared.count;
  }
  await prisma.bookIngestionRun.update({ where: { id: run.id }, data: { draftPurgedAt: now } });
  return outcome;
}

/**
 * Purges every run whose draft has expired. `dryRun` reports what would be
 * purged without changing anything.
 */
export async function purgeExpiredDrafts(options: { now?: Date; dryRun?: boolean; limit?: number } = {}): Promise<{ dryRun: boolean; due: Array<{ runId: string; bookTitle: string; expiresAt: Date }>; purged: PurgeOutcome[] }> {
  const now = options.now ?? new Date();
  const due = await prisma.bookIngestionRun.findMany({
    where: { draftExpiresAt: { lte: now }, draftPurgedAt: null },
    orderBy: { draftExpiresAt: 'asc' },
    take: options.limit ?? 5,
    select: { id: true, sourceDocumentId: true, draftExpiresAt: true, book: { select: { title: true } } },
  });
  const summary = due.map(run => ({ runId: run.id, bookTitle: run.book.title, expiresAt: run.draftExpiresAt! }));
  if (options.dryRun) return { dryRun: true, due: summary, purged: [] };
  const purged: PurgeOutcome[] = [];
  for (const run of due) purged.push(await purgeRun(run, now));
  return { dryRun: false, due: summary, purged };
}
