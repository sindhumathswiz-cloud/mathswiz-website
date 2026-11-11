import { describe, expect, it } from 'vitest';
import type { ConfirmedChapter } from '@/lib/book-manifest';
import { chapterExtractionProgress, extractablePages } from './chapter-extraction-progress';

const chapter = (over: Partial<ConfirmedChapter> = {}): ConfirmedChapter => ({
  id: 'c1', name: 'Matrices', topic: null, startPage: 10, endPage: 16, manifestConfirmedAt: '2026-10-01',
  exercises: [
    { sectionType: 'MCQ', startPage: 10, endPage: 13, answerKeyStartPage: 15, answerKeyEndPage: 15, solutionsStartPage: 16, solutionsEndPage: 16, noAnswers: false } as never,
  ],
  ...over,
});

describe('extractablePages', () => {
  it('leaves out the answer-key and solutions pages of a confirmed chapter, which extraction skips', () => {
    expect(extractablePages(chapter(), [chapter()])).toEqual([10, 11, 12, 13, 14]);
  });

  it('keeps every page of a chapter not yet confirmed, and has none without a range', () => {
    expect(extractablePages(chapter(), [])).toEqual([10, 11, 12, 13, 14, 15, 16]);
    expect(extractablePages({ startPage: null, endPage: 12 }, [])).toEqual([]);
  });
});

describe('chapterExtractionProgress', () => {
  it('counts pages done and failed, and continues from the first page not done', () => {
    const statuses = new Map([[10, 'COMPLETED'], [11, 'COMPLETED'], [12, 'FAILED'], [13, 'PENDING']]);
    expect(chapterExtractionProgress([10, 11, 12, 13, 14], statuses)).toEqual({ pages: 5, done: 2, failed: 1, nextPage: 12 });
  });

  it('has nowhere to continue from once every page is done', () => {
    const statuses = new Map([[10, 'COMPLETED'], [11, 'COMPLETED']]);
    expect(chapterExtractionProgress([10, 11], statuses)).toEqual({ pages: 2, done: 2, failed: 0, nextPage: null });
  });
});
