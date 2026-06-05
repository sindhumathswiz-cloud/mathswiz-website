import { describe, it, expect } from 'vitest';
import { chunkMarkdown } from './markdown-chunker';

const block = (label: string, len: number) => `${label} ` + 'x'.repeat(Math.max(0, len - label.length - 1));

describe('chunkMarkdown', () => {
  it('returns [] for empty input', () => {
    expect(chunkMarkdown('')).toEqual([]);
    expect(chunkMarkdown('   ')).toEqual([]);
  });

  it('keeps a small document as a single chunk', () => {
    const md = 'Q1 ...\n\nSol1 ...\n\nQ2 ...';
    expect(chunkMarkdown(md, 6000)).toEqual([md]);
  });

  it('splits into multiple chunks on paragraph boundaries when over target', () => {
    const md = [block('Q1', 400), block('Q2', 400), block('Q3', 400)].join('\n\n');
    const chunks = chunkMarkdown(md, 700, 1);
    expect(chunks.length).toBeGreaterThan(1);
    // never splits inside a block
    chunks.forEach((c) => expect(c).not.toMatch(/x{0}Q1.*Q1/s));
  });

  it('overlaps blocks across chunk boundaries (continuity for split Q+Sol)', () => {
    const md = [block('A', 400), block('B', 400), block('C', 400)].join('\n\n');
    const chunks = chunkMarkdown(md, 700, 1);
    // the last block of chunk[0] should reappear at the start of chunk[1]
    const tailOf0 = chunks[0].split('\n\n').pop();
    expect(chunks[1].startsWith(tailOf0!)).toBe(true);
  });

  it('an oversized single block becomes its own chunk', () => {
    const md = [block('huge', 9000), block('small', 100)].join('\n\n');
    const chunks = chunkMarkdown(md, 6000, 1);
    expect(chunks.some((c) => c.length >= 6000)).toBe(true);
  });
});
