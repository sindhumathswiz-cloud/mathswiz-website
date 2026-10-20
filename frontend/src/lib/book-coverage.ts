/**
 * How completely a book's questions are in the bank, chapter by chapter: pages, pages that gave at least one question,
 * questions extracted, approved, waiting for review, and with a worked solution. Pure, so it can be tested and reused.
 *
 * "Misfiled" questions are those under a chapter with no page range (a chapter the extraction model invented from a
 * topic guess) or under no chapter at all; refileByPage() says where each belongs by the page it starts on.
 */

export interface CoverageChapter {
  id: string;
  name: string;
  startPage: number | null;
  endPage: number | null;
  manifestConfirmed: boolean;
  exerciseCount: number;
}

export interface CoverageQuestion {
  id: string;
  bookChapterId: string | null;
  status: string;
  sourcePageStart: number | null;
  hasSolution: boolean;
}

export interface ChapterCoverage {
  id: string;
  name: string;
  startPage: number;
  endPage: number;
  pages: number;
  pagesWithQuestions: number;
  /** Pages of the chapter that gave no question (theory and answer pages are among them). */
  emptyPages: number[];
  extracted: number;
  approved: number;
  waiting: number;
  approvedWithSolution: number;
  waitingWithSolution: number;
  manifestConfirmed: boolean;
  exerciseCount: number;
  /** Fewer questions than one per two pages: worth a look. */
  thin: boolean;
}

export interface BookCoverage {
  chapters: ChapterCoverage[];
  misfiled: Array<{ id: string; chapterId: string | null; page: number | null; belongsTo: string | null }>;
  totals: { extracted: number; approved: number; waiting: number; approvedWithSolution: number; pages: number; pagesWithQuestions: number };
}

const WAITING = new Set(['DRAFT', 'PENDING_REVIEW', 'REPORTED', 'NEEDS_REVIEW']);

/** The real chapter (one with a page range) whose pages contain `page`, if exactly one does. */
export function chapterForPageNumber(chapters: CoverageChapter[], page: number | null): string | null {
  if (page == null) return null;
  const containing = chapters.filter((c) => c.startPage != null && c.endPage != null && page >= c.startPage && page <= c.endPage);
  return containing.length === 1 ? containing[0].id : null;
}

export function buildCoverage(chapters: CoverageChapter[], questions: CoverageQuestion[]): BookCoverage {
  const real = chapters.filter((c) => c.startPage != null && c.endPage != null && c.endPage >= c.startPage)
    .sort((a, b) => (a.startPage as number) - (b.startPage as number));
  const realIds = new Set(real.map((c) => c.id));
  const live = questions.filter((q) => q.status !== 'ARCHIVED');

  const rows: ChapterCoverage[] = real.map((chapter) => {
    const start = chapter.startPage as number;
    const end = chapter.endPage as number;
    const own = live.filter((q) => q.bookChapterId === chapter.id);
    const pagesWith = new Set(own.map((q) => q.sourcePageStart).filter((p): p is number => p != null && p >= start && p <= end));
    const emptyPages: number[] = [];
    for (let p = start; p <= end; p++) if (!pagesWith.has(p)) emptyPages.push(p);
    const approved = own.filter((q) => q.status === 'APPROVED');
    const waiting = own.filter((q) => WAITING.has(q.status));
    const pages = end - start + 1;
    return {
      id: chapter.id, name: chapter.name, startPage: start, endPage: end, pages,
      pagesWithQuestions: pagesWith.size, emptyPages,
      extracted: own.length, approved: approved.length, waiting: waiting.length,
      approvedWithSolution: approved.filter((q) => q.hasSolution).length,
      waitingWithSolution: waiting.filter((q) => q.hasSolution).length,
      manifestConfirmed: chapter.manifestConfirmed, exerciseCount: chapter.exerciseCount,
      thin: own.length * 2 < pages,
    };
  });

  const misfiled = live
    .filter((q) => !q.bookChapterId || !realIds.has(q.bookChapterId))
    .map((q) => ({ id: q.id, chapterId: q.bookChapterId, page: q.sourcePageStart, belongsTo: chapterForPageNumber(real, q.sourcePageStart) }));

  const sum = (key: keyof ChapterCoverage) => rows.reduce((n, r) => n + (r[key] as number), 0);
  return {
    chapters: rows,
    misfiled,
    totals: { extracted: sum('extracted'), approved: sum('approved'), waiting: sum('waiting'), approvedWithSolution: sum('approvedWithSolution'), pages: sum('pages'), pagesWithQuestions: sum('pagesWithQuestions') },
  };
}
