import { describe, expect, it } from 'vitest';
import { markdownToBlocks, selectReadings } from './page-readings';

const gemini = { provider: 'GEMINI_VISION', structuredData: { questions: [{ contentMmd: '1. Evaluate $x$', options: [] }] } };
const mathpixBenchmark = { provider: 'MATHPIX_OCR', rawOutput: { line_data: [{ type: 'math', text: '\\( x \\)' }] } };

describe('markdownToBlocks', () => {
  it('makes one block per line and keeps fenced display math together', () => {
    const blocks = markdownToBlocks('# Exercise 1\n\n1. Evaluate:\n\n$$\n\\int x\ndx\n$$\n\n(a) $x$ (b) $y$\n');
    expect(blocks).toEqual([
      { type: 'title', content: 'Exercise 1' },
      { type: 'text', content: '1. Evaluate:' },
      { type: 'equation', content: '\\int x dx' },
      { type: 'text', content: '(a) $x$ (b) $y$' },
    ]);
  });

  it('recognises single-line display math', () => {
    expect(markdownToBlocks('$$x^2 + 1$$')).toEqual([{ type: 'equation', content: 'x^2 + 1' }]);
  });

  it('returns nothing for blank input', () => {
    expect(markdownToBlocks('  \n\n')).toEqual([]);
  });
});

describe('selectReadings', () => {
  it('is READY with a Mathpix benchmark and a Gemini benchmark', () => {
    const result = selectReadings({ benchmarks: [mathpixBenchmark, gemini], extraction: null });
    expect(result.coverage).toBe('READY');
    if (result.coverage === 'READY') expect(result.mathpix.origin).toBe('BENCHMARK');
  });

  it('is READY using the stored extraction text when there is no Mathpix benchmark', () => {
    const result = selectReadings({ benchmarks: [gemini], extraction: { provider: 'MATHPIX_OCR', rawMarkdown: '1. Evaluate $x$' } });
    expect(result.coverage).toBe('READY');
    if (result.coverage === 'READY') expect(result.mathpix.origin).toBe('EXTRACTION');
  });

  it('prefers the typed Mathpix benchmark over the extraction text', () => {
    const result = selectReadings({ benchmarks: [mathpixBenchmark, gemini], extraction: { provider: 'MATHPIX_OCR', rawMarkdown: 'text' } });
    if (result.coverage === 'READY') expect(result.mathpix.origin).toBe('BENCHMARK');
  });

  it('does not count the embedded text layer as a reading', () => {
    expect(selectReadings({ benchmarks: [gemini], extraction: { provider: 'NATIVE_TEXT', rawMarkdown: 'plain text' } })).toEqual({ coverage: 'SINGLE_READING', has: 'GEMINI_VISION' });
  });

  it('reports a single Mathpix reading, a single Gemini reading, or nothing', () => {
    expect(selectReadings({ benchmarks: [mathpixBenchmark], extraction: null })).toMatchObject({ coverage: 'SINGLE_READING', has: 'MATHPIX_OCR' });
    expect(selectReadings({ benchmarks: [], extraction: { provider: 'MATHPIX_OCR', rawMarkdown: 'text' } })).toMatchObject({ coverage: 'SINGLE_READING', has: 'MATHPIX_OCR' });
    expect(selectReadings({ benchmarks: [], extraction: null })).toEqual({ coverage: 'NO_READING' });
  });
});
