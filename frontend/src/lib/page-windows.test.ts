import { describe, it, expect } from 'vitest';
import { buildPageWindows, dedupeByContent, dedupKey } from './page-windows';

describe('buildPageWindows', () => {
  it('returns [] for no pages', () => {
    expect(buildPageWindows([])).toEqual([]);
  });

  it('covers all pages with overlap', () => {
    const pages = ['a', 'b', 'c', 'd', 'e', 'f', 'g'];
    const wins = buildPageWindows(pages, 4, 1); // step 3
    // windows: 1-4, 4-7 (stops once all pages are covered)
    expect(wins.map((w) => [w.startPage, w.endPage])).toEqual([[1, 4], [4, 7]]);
    // every page index appears in at least one window
    const covered = new Set<number>();
    wins.forEach((w) => { for (let p = w.startPage; p <= w.endPage; p++) covered.add(p); });
    expect(covered.size).toBe(7);
  });

  it('adjacent pages share a window (so a split Q+Sol stay together)', () => {
    const wins = buildPageWindows(['Q1 ...', 'Sol1 ...'], 4, 1);
    expect(wins).toHaveLength(1);
    expect(wins[0].text).toContain('[Page 1]');
    expect(wins[0].text).toContain('[Page 2]');
  });

  it('single page yields one window', () => {
    expect(buildPageWindows(['only'])).toHaveLength(1);
  });

  it('clamps overlap >= size', () => {
    const wins = buildPageWindows(['a', 'b', 'c'], 2, 5); // overlap clamped to 1, step 1
    expect(wins[0]).toMatchObject({ startPage: 1, endPage: 2 });
  });
});

describe('dedupeByContent', () => {
  it('removes duplicates introduced by overlapping windows', () => {
    const items = [
      { content: 'What is $2+2$?' },
      { content: 'what is  2+2 ?' }, // same after normalization
      { content: 'Different question entirely' },
    ];
    expect(dedupeByContent(items)).toHaveLength(2);
  });

  it('works on canonical questionContent too and keeps keyless items', () => {
    const items = [{ questionContent: 'Q one here' }, { questionContent: 'Q one here' }, { content: '' }];
    expect(dedupeByContent(items)).toHaveLength(2);
  });

  it('dedupKey ignores whitespace/case/punctuation', () => {
    expect(dedupKey('A, B!')).toBe(dedupKey('ab'));
  });
});
