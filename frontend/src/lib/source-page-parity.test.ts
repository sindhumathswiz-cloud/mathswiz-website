import { describe, expect, it } from 'vitest';
import { comparePages, describePageList } from './source-page-parity';

const rows = (pages: number[], extra: Partial<{ hasImage: boolean; hasText: boolean }> = {}) =>
  pages.map(pageNumber => ({ pageNumber, hasImage: true, hasText: true, ...extra }));

describe('comparePages', () => {
  it('matches when every page 1..N is held with an image', () => {
    const parity = comparePages(5, rows([1, 2, 3, 4, 5]));
    expect(parity).toMatchObject({ pdfPages: 5, pagesHeld: 5, pagesWithImage: 5, matches: true, missingPages: [], unexpectedPages: [] });
  });

  it('reports missing pages even when a stray extra page makes the totals add up', () => {
    const parity = comparePages(5, rows([1, 2, 4, 5, 6]));
    expect(parity.pagesHeld).toBe(5);
    expect(parity.missingPages).toEqual([3]);
    expect(parity.unexpectedPages).toEqual([6]);
    expect(parity.matches).toBe(false);
  });

  it('flags a page that exists without a rendered image', () => {
    const parity = comparePages(3, [...rows([1, 3]), { pageNumber: 2, hasImage: false, hasText: false }]);
    expect(parity.missingImagePages).toEqual([2]);
    expect(parity.pagesWithImage).toBe(2);
    expect(parity.matches).toBe(false);
  });

  it('counts pages that carry a text layer separately from images', () => {
    const parity = comparePages(2, [{ pageNumber: 1, hasImage: true, hasText: true }, { pageNumber: 2, hasImage: true, hasText: false }]);
    expect(parity.pagesWithText).toBe(1);
    expect(parity.matches).toBe(true);
  });

  it('does not match an empty book', () => {
    expect(comparePages(3, []).matches).toBe(false);
  });
});

describe('describePageList', () => {
  it('collapses runs and truncates long lists', () => {
    expect(describePageList([12, 13, 20, 21, 22, 30])).toBe('12–13, 20–22, 30');
    expect(describePageList(Array.from({ length: 40 }, (_, i) => i * 2 + 1), 3)).toBe('1, 3, 5 and 37 more');
  });
});
