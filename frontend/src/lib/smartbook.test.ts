import { describe, expect, it } from 'vitest';
import { buildOutline, exercisePages, inPrintedOrder, MAX_EXERCISE_PAGES, pageIsInBook } from './smartbook';

const chapter = (id: string, startPage: number, orderIndex: number, name = id) => ({ id, name, chapterNumber: null, startPage, orderIndex });
const exercise = (id: string, chapterId: string, startPage: number, endPage: number, sectionType = 'SHORT_ANSWER', title: string | null = null, orderIndex = 0) =>
  ({ id, chapterId, bookId: 'b1', startPage, endPage, code: null, title, sectionType, orderIndex });
const q = (bookChapterId: string, sourcePageStart: number, bookExerciseId: string | null = null) => ({ bookId: 'b1', bookChapterId, bookExerciseId, sourcePageStart });

describe('buildOutline', () => {
  it('lists chapters in page order with the exercises that have approved questions', () => {
    const outline = buildOutline(
      [chapter('integrals', 240, 0), chapter('relations', 10, 1)],
      [exercise('mcq', 'integrals', 243, 246, 'MCQ'), exercise('short', 'integrals', 247, 250), exercise('empty', 'integrals', 251, 255, 'LONG_ANSWER'), exercise('rel-ex', 'relations', 12, 14)],
      [q('integrals', 244), q('integrals', 245), q('integrals', 248), q('relations', 13), q('integrals', 999, 'short')],
    );
    expect(outline.chapters.map((c) => c.id)).toEqual(['relations', 'integrals']);
    const integrals = outline.chapters[1];
    expect(integrals.exercises.map((e) => [e.id, e.questionCount])).toEqual([['mcq', 2], ['short', 2]]);
    expect(integrals.questionCount).toBe(4);
    expect(outline.questionCount).toBe(5);
  });

  it('leaves out a chapter with no approved questions in any exercise', () => {
    const outline = buildOutline([chapter('c', 1, 0)], [exercise('e', 'c', 1, 2)], []);
    expect(outline.chapters).toEqual([]);
  });

  it('tells apart two exercises with the same label by their pages', () => {
    const outline = buildOutline(
      [chapter('c', 1, 0)],
      [exercise('a', 'c', 5, 6, 'LONG_ANSWER', null, 0), exercise('b', 'c', 9, 9, 'LONG_ANSWER', null, 1)],
      [q('c', 5), q('c', 9)],
    );
    expect(outline.chapters[0].exercises.map((e) => e.label)).toEqual(['Long answer (pp. 5–6)', 'Long answer (p. 9)']);
  });
});

describe('exercisePages', () => {
  it('lists the pages of an exercise', () => {
    expect(exercisePages({ startPage: 243, endPage: 246 })).toEqual([243, 244, 245, 246]);
    expect(exercisePages({ startPage: 7, endPage: null })).toEqual([7]);
    expect(exercisePages({ startPage: null, endPage: 9 })).toEqual([]);
  });
  it('never asks for more than a bounded number of pages', () => {
    expect(exercisePages({ startPage: 1, endPage: 500 })).toHaveLength(MAX_EXERCISE_PAGES);
  });
});

describe('inPrintedOrder', () => {
  it('orders by page, then printed number as a person reads it', () => {
    const list = [
      { id: '10', sourcePageStart: 5, printedNumber: '10' },
      { id: '2', sourcePageStart: 5, printedNumber: '2' },
      { id: '3b', sourcePageStart: 5, printedNumber: '3(b)' },
      { id: '3a', sourcePageStart: 5, printedNumber: '3(a)' },
      { id: 'p4', sourcePageStart: 4, printedNumber: '20' },
    ];
    expect(inPrintedOrder(list).map((x) => x.id)).toEqual(['p4', '2', '3a', '3b', '10']);
  });
});

describe('pageIsInBook', () => {
  it('allows only pages inside an exercise or section of the book', () => {
    const ranges = [{ startPage: 240, endPage: 242 }, { startPage: 243, endPage: 246 }];
    expect(pageIsInBook(241, ranges)).toBe(true);
    expect(pageIsInBook(246, ranges)).toBe(true);
    expect(pageIsInBook(100, ranges)).toBe(false);
  });
});
