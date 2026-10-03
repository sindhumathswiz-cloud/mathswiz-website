import { describe, expect, it } from 'vitest';
import { joinSelectedLines, layerFromMathpixLines, nativeLayerIsUsable, parseTextLayer } from './page-text-layer';

const box = (x0: number, y0: number, x1: number, y1: number) => [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];

describe('layerFromMathpixLines', () => {
  const lineData = [
    { type: 'text', text: '1. Evaluate the integral', cnt: box(100, 200, 700, 240) },
    { type: 'math', text: '\\( \\int x^{2} d x \\)', cnt: box(150, 260, 400, 330) },
    { type: 'diagram', text: '', cnt: box(100, 400, 600, 800) },
    { type: 'text', text: '   ', cnt: box(1, 1, 2, 2) },
    { type: 'text', text: 'no geometry' },
  ];

  it('normalises contours to page fractions and keeps reading order', () => {
    const layer = layerFromMathpixLines(lineData, 1000, 2000)!;
    expect(layer.source).toBe('MATHPIX_OCR');
    expect(layer.lines.map(line => line.text)).toEqual(['1. Evaluate the integral', '$\\int x^{2} d x$']);
    expect(layer.lines[0]).toMatchObject({ x: 0.1, y: 0.1, w: 0.6, h: 0.02, kind: 'text' });
    expect(layer.lines[1]).toMatchObject({ kind: 'math', x: 0.15, y: 0.13 });
  });

  it('converts Mathpix delimiters to the pipeline convention and wraps bare LaTeX in math lines', () => {
    const layer = layerFromMathpixLines([
      { type: 'math', text: '\\[ \\frac{a}{b} \\]', cnt: box(0, 0, 100, 50) },
      { type: 'equation', text: '\\frac{c}{d}', cnt: box(0, 60, 100, 110) },
    ], 1000, 1000)!;
    // Same output as the stored page text: cleanMathpixMarkdown folds display math to $...$.
    expect(layer.lines.map(line => line.text)).toEqual(['$\\frac{a}{b}$', '$\\frac{c}{d}$']);
  });

  it('returns null when there is nothing usable or the image size is unknown', () => {
    expect(layerFromMathpixLines([], 1000, 1000)).toBeNull();
    expect(layerFromMathpixLines(lineData, 0, 1000)).toBeNull();
    expect(layerFromMathpixLines('nope', 1000, 1000)).toBeNull();
  });

  it('clamps boxes that run past the page edge', () => {
    const layer = layerFromMathpixLines([{ type: 'text', text: 'edge', cnt: box(900, 900, 1200, 1200) }], 1000, 1000)!;
    expect(layer.lines[0].x + layer.lines[0].w).toBeLessThanOrEqual(1);
    expect(layer.lines[0].y + layer.lines[0].h).toBeLessThanOrEqual(1);
  });
});

describe('parseTextLayer', () => {
  const valid = { version: 1, source: 'NATIVE_PDF', garbled: 0, lines: [{ x: 0.1, y: 0.1, w: 0.5, h: 0.02, text: 'Hello world', kind: 'text', words: [[0.1, 0.2, 'Hello'], [0.32, 0.2, 'world']] }] };

  it('accepts a well-formed layer and keeps words', () => {
    const layer = parseTextLayer(valid)!;
    expect(layer.lines[0].words).toHaveLength(2);
    expect(nativeLayerIsUsable(layer)).toBe(true);
  });

  it('drops malformed lines and rejects an unknown version or source', () => {
    const layer = parseTextLayer({ ...valid, lines: [...valid.lines, { x: 'a', y: 0, w: 0, h: 0, text: 'bad' }, { x: 0, y: 0, w: 1, h: 1, text: '  ' }] })!;
    expect(layer.lines).toHaveLength(1);
    expect(parseTextLayer({ ...valid, version: 2 })).toBeNull();
    expect(parseTextLayer({ ...valid, source: 'GUESS' })).toBeNull();
    expect(parseTextLayer(null)).toBeNull();
    expect(parseTextLayer([])).toBeNull();
  });

  it('treats a mostly-garbled native layer as unusable', () => {
    expect(nativeLayerIsUsable(parseTextLayer({ ...valid, garbled: 0.4 }))).toBe(false);
    expect(nativeLayerIsUsable(null)).toBe(false);
  });
});

describe('joinSelectedLines', () => {
  it('puts consecutive lines on separate lines and leaves a blank line at a paragraph gap', () => {
    const text = joinSelectedLines([
      { y: 0.10, h: 0.02, text: '1. Find x' },
      { y: 0.125, h: 0.02, text: 'if $x^2=4$' },
      { y: 0.30, h: 0.02, text: '2. Next question' },
    ]);
    expect(text).toBe('1. Find x\nif $x^2=4$\n\n2. Next question');
  });

  it('always separates lines from different pages with a blank line', () => {
    expect(joinSelectedLines([{ y: 0.9, h: 0.02, text: 'end', page: 4 }, { y: 0.9, h: 0.02, text: 'start', page: 5 }])).toBe('end\n\nstart');
  });
});
