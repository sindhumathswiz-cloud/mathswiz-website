import { describe, expect, it } from 'vitest';
import { DEFAULT_OPTIONS, MAX_IMPORT_PAGES, PAGE_LONG_SIDE, checkImport, cleanOptions, describePlan, looksLikeSpread, naturalCompare, planImage, planImport, sortByName } from './page-image-import';

const opts = (over: Partial<typeof DEFAULT_OPTIONS> & { crop?: Partial<typeof DEFAULT_OPTIONS.crop> } = {}) => ({ ...DEFAULT_OPTIONS, ...over, crop: { ...DEFAULT_OPTIONS.crop, ...(over.crop ?? {}) } });

describe('ordering', () => {
  it('orders file names as a person would, not letter by letter', () => {
    expect(sortByName([{ name: 'page10.png' }, { name: 'page2.png' }, { name: 'Page1.png' }]).map(f => f.name)).toEqual(['Page1.png', 'page2.png', 'page10.png']);
    expect(['Screenshot (12).png', 'Screenshot (2).png', 'Screenshot (1).png'].sort(naturalCompare)).toEqual(['Screenshot (1).png', 'Screenshot (2).png', 'Screenshot (12).png']);
  });
});

describe('cleanOptions', () => {
  it('keeps crops sensible and the split point near the middle', () => {
    const cleaned = cleanOptions(opts({ crop: { top: 0.9, bottom: 0.9, left: -1, right: NaN as unknown as number }, split: 'halves', splitAt: 0.99 }));
    expect(cleaned.crop).toEqual({ top: 0.45, bottom: 0.45, left: 0, right: 0 });
    expect(cleaned.splitAt).toBe(0.7);
    expect(cleaned.split).toBe('halves');
  });
});

describe('planImage', () => {
  it('uses the whole image by default, scaled down only if it is very large', () => {
    expect(planImage(0, 1200, 1600, DEFAULT_OPTIONS)).toEqual([{ source: 0, x: 0, y: 0, width: 1200, height: 1600, outWidth: 1200, outHeight: 1600 }]);
    const [big] = planImage(0, 3600, 4800, DEFAULT_OPTIONS);
    expect(Math.max(big.outWidth, big.outHeight)).toBe(PAGE_LONG_SIDE);
    expect(big.outWidth / big.outHeight).toBeCloseTo(0.75, 2);
  });

  it('cuts away the browser chrome and the reader frame before anything else', () => {
    const [page] = planImage(2, 2000, 1000, opts({ crop: { top: 0.1, bottom: 0.2, left: 0.05, right: 0.05 } }));
    expect(page).toMatchObject({ source: 2, x: 100, y: 100, width: 1800, height: 700 });
  });

  it('splits a two-page spread into a left page and a right page that together cover the cropped area', () => {
    const [left, right] = planImage(0, 2000, 1000, opts({ split: 'halves', crop: { top: 0.1, bottom: 0, left: 0, right: 0 } }));
    expect(left).toMatchObject({ x: 0, y: 100, width: 1000, height: 900 });
    expect(right).toMatchObject({ x: 1000, y: 100, width: 1000, height: 900 });
    expect(left.width + right.width).toBe(2000);
  });

  it('puts the gutter where it is told, and leaves no pixel out or counted twice', () => {
    const [left, right] = planImage(0, 1001, 800, opts({ split: 'halves', splitAt: 0.48 }));
    expect(left.x + left.width).toBe(right.x);
    expect(left.width + right.width).toBe(1001);
    expect(left.width).toBe(Math.round(1001 * 0.48));
  });
});

describe('planImport and checks', () => {
  it('numbers pages in order: all pages of image 0, then image 1', () => {
    const pages = planImport([{ width: 2000, height: 1000 }, { width: 2000, height: 1000 }], opts({ split: 'halves' }));
    expect(pages.map(p => p.source)).toEqual([0, 0, 1, 1]);
    expect(pages.map(p => p.x)).toEqual([0, 1000, 0, 1000]);
  });

  it('recognises a spread by its proportions', () => {
    expect(looksLikeSpread(1920, 1080)).toBe(true);
    expect(looksLikeSpread(1200, 1600)).toBe(false);
  });

  it('refuses nothing chosen or too many pages, and warns when splitting does not match the pictures', () => {
    expect(checkImport(0, DEFAULT_OPTIONS)).toEqual([{ level: 'error', message: 'Choose the page images first.' }]);
    expect(checkImport(MAX_IMPORT_PAGES, opts({ split: 'halves' })).some(p => p.level === 'error' && /limit/.test(p.message))).toBe(true);
    expect(checkImport(10, DEFAULT_OPTIONS, { width: 1920, height: 1080 })[0]).toMatchObject({ level: 'warning' });
    expect(checkImport(10, opts({ split: 'halves' }), { width: 1200, height: 1600 })[0]).toMatchObject({ level: 'warning' });
    expect(checkImport(10, DEFAULT_OPTIONS, { width: 1200, height: 1600 })).toEqual([]);
  });

  it('describes the plan in words', () => {
    expect(describePlan(1, DEFAULT_OPTIONS)).toBe('1 image → 1 page');
    expect(describePlan(3, opts({ split: 'halves' }))).toBe('3 images → 6 pages');
  });
});
