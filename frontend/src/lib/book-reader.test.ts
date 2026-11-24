import { describe, expect, it } from 'vitest';
import { chapterAt, readerChapters } from './book-reader-chapters';

const ch = (id: string, name: string, startPage: number | null, chapterNumber: string | null = null) => ({ id, name, chapterNumber, startPage });

describe('readerChapters', () => {
  it('lists chapters by their first page, not the order they were found in', () => {
    const out = readerChapters([ch('c3', 'Matrices', 80, '3'), ch('c1', 'Relations', 13, '1'), ch('c2', 'Inverse Trigonometric Functions', 42, '2')], [1, 2, 13, 42, 80, 120]);
    expect(out.map((c) => c.id)).toEqual(['c1', 'c2', 'c3']);
  });

  it('leaves out chapters with no first page or outside the book, and the same chapter entered twice', () => {
    const out = readerChapters([ch('a', 'Sets', 5), ch('b', 'Sets ', 5), ch('c', 'Limits', null), ch('d', 'Appendix', 900)], [1, 2, 3, 4, 5, 6]);
    expect(out.map((c) => c.id)).toEqual(['a']);
  });

  it('has no chapters for a book without pages', () => {
    expect(readerChapters([ch('a', 'Sets', 5)], [])).toEqual([]);
  });
});

describe('chapterAt', () => {
  const chapters = readerChapters([ch('c1', 'Relations', 13), ch('c2', 'Functions', 42)], Array.from({ length: 100 }, (_, i) => i + 1));
  it('finds the chapter a page falls in', () => {
    expect(chapterAt(chapters, 12)).toBeNull();
    expect(chapterAt(chapters, 13)?.id).toBe('c1');
    expect(chapterAt(chapters, 41)?.id).toBe('c1');
    expect(chapterAt(chapters, 90)?.id).toBe('c2');
    expect(chapterAt(chapters, null)).toBeNull();
  });
});
