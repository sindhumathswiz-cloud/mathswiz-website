import { describe, expect, it } from 'vitest';
import { buildCoverage, chapterForPageNumber, type CoverageChapter, type CoverageQuestion } from './book-coverage';

const ch = (id: string, startPage: number | null, endPage: number | null, extra: Partial<CoverageChapter> = {}): CoverageChapter =>
  ({ id, name: id, startPage, endPage, manifestConfirmed: false, exerciseCount: 0, ...extra });
const q = (id: string, bookChapterId: string | null, sourcePageStart: number | null, status = 'APPROVED', hasSolution = true): CoverageQuestion =>
  ({ id, bookChapterId, status, sourcePageStart, hasSolution });

describe('buildCoverage', () => {
  const chapters = [ch('cont', 137, 146), ch('relations', 13, 16), ch('conic-guess', null, null)];

  it('counts per chapter, in page order, and lists the pages that gave nothing', () => {
    const cov = buildCoverage(chapters, [
      q('a', 'relations', 13), q('b', 'relations', 13, 'DRAFT', false), q('c', 'relations', 15, 'DRAFT', true), q('x', 'relations', 14, 'ARCHIVED'),
      q('d', 'cont', 145),
    ]);
    expect(cov.chapters.map((c) => c.id)).toEqual(['relations', 'cont']);
    const rel = cov.chapters[0];
    expect(rel).toMatchObject({ pages: 4, pagesWithQuestions: 2, emptyPages: [14, 16], extracted: 3, approved: 1, waiting: 2, approvedWithSolution: 1, waitingWithSolution: 1, thin: false });
    const cont = cov.chapters[1];
    expect(cont).toMatchObject({ pages: 10, extracted: 1, thin: true });
    expect(cov.totals).toMatchObject({ extracted: 4, approved: 2, waiting: 2, pages: 14, pagesWithQuestions: 3 });
  });

  it('finds misfiled questions and where they belong by their page', () => {
    const cov = buildCoverage(chapters, [q('m1', 'conic-guess', 140), q('m2', null, 15), q('m3', null, 500), q('ok', 'cont', 140)]);
    expect(cov.misfiled).toEqual([
      { id: 'm1', chapterId: 'conic-guess', page: 140, belongsTo: 'cont' },
      { id: 'm2', chapterId: null, page: 15, belongsTo: 'relations' },
      { id: 'm3', chapterId: null, page: 500, belongsTo: null },
    ]);
  });
});

describe('chapterForPageNumber', () => {
  it('only answers when exactly one chapter holds the page', () => {
    const chapters = [ch('a', 1, 10), ch('b', 10, 20)];
    expect(chapterForPageNumber(chapters, 5)).toBe('a');
    expect(chapterForPageNumber(chapters, 10)).toBeNull();
    expect(chapterForPageNumber(chapters, null)).toBeNull();
  });
});
