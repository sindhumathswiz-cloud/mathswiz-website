import { answerKeySectionForPage, chapterForPage, sectionForPage, solutionsSectionForPage, type ConfirmedChapter } from '@/lib/book-manifest';

/**
 * How far question extraction has got through one chapter, read from what is saved -- the pages marked done and
 * the draft questions on file -- so the manifest page shows it again after a reload or a dropped connection, and
 * extraction can continue from the first page not yet done.
 */
export interface ChapterExtractionProgress {
  /** Pages extraction reads in this chapter. */
  pages: number;
  done: number;
  failed: number;
  /** The first page not yet done, where extraction continues; null when every page is done. */
  nextPage: number | null;
}

/**
 * The pages of a chapter that extraction reads: its PDF range, less the pages of a confirmed chapter that only list
 * answers or worked solutions (in an answer-key or solutions range and in no question section) -- the extraction
 * route skips those, so they never count as left to do.
 */
export function extractablePages(chapter: { startPage: number | null; endPage: number | null }, confirmed: ConfirmedChapter[]): number[] {
  if (chapter.startPage == null || chapter.endPage == null || chapter.endPage < chapter.startPage) return [];
  const pages: number[] = [];
  for (let p = chapter.startPage; p <= chapter.endPage; p++) {
    const listingOnly = chapterForPage(confirmed, p) && !sectionForPage(confirmed, p)
      && (answerKeySectionForPage(confirmed, p) || solutionsSectionForPage(confirmed, p));
    if (!listingOnly) pages.push(p);
  }
  return pages;
}

export function chapterExtractionProgress(pages: number[], statusByPage: Map<number, string>): ChapterExtractionProgress {
  let done = 0;
  let failed = 0;
  let nextPage: number | null = null;
  for (const p of pages) {
    const status = statusByPage.get(p);
    if (status === 'COMPLETED') { done++; continue; }
    if (status === 'FAILED') failed++;
    if (nextPage == null) nextPage = p;
  }
  return { pages: pages.length, done, failed, nextPage };
}
