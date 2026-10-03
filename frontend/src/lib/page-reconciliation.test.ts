import { describe, expect, it } from 'vitest';
import { compareBlockToCandidates } from './formula-reconciliation';
import { geminiCandidateLines, mathpixLinesToBlocks, reconcilePage, reconciliationRecord } from './page-reconciliation';

describe('compareBlockToCandidates', () => {
  it('passes the same formula written in a different LaTeX style', () => {
    const result = compareBlockToCandidates('\\( \\int x^{2} d x=\\frac{x^{3}}{3}+C \\)', ['Evaluate $\\int x^2 \\, dx = \\dfrac{x^3}{3} + C$']);
    expect(result.reviewStatus).toBe('AGREEMENT_PASS');
    expect(result.similarity).toBeGreaterThanOrEqual(0.93);
  });

  it('holds when one provider changes an exponent', () => {
    const result = compareBlockToCandidates('\\( \\int x^{2} d x=\\frac{x^{3}}{3}+C \\)', ['$\\int x^2 dx = \\frac{x^2}{3} + C$']);
    expect(result.reviewStatus).toBe('HOLD_FOR_RECONCILIATION');
  });

  it('holds when a term is missing from the other provider', () => {
    const result = compareBlockToCandidates('\\( f(x) = a + b + c + d + e + f \\)', ['$f(x) = a + b + c + d + e$ and more words around it']);
    expect(result.reviewStatus).toBe('HOLD_FOR_RECONCILIATION');
  });

  it('holds when the other provider has nothing to compare against', () => {
    expect(compareBlockToCandidates('\\( x^2 + y^2 = r^2 \\)', []).reviewStatus).toBe('HOLD_FOR_RECONCILIATION');
  });
});

describe('mathpixLinesToBlocks / geminiCandidateLines', () => {
  it('maps Mathpix line types and bounding boxes', () => {
    const blocks = mathpixLinesToBlocks({ line_data: [
      { type: 'page_info', text: '12', cnt: [[0, 0], [10, 10]] },
      { type: 'math', text: 'x', cnt: [[5, 20], [50, 40]] },
      { type: 'text', text: 'hello', included: false },
    ] });
    expect(blocks).toHaveLength(2);
    expect(blocks[0].type).toBe('header');
    expect(blocks[1]).toMatchObject({ type: 'equation', top_left_x: 5, bottom_right_y: 40 });
  });

  it('returns no blocks when line data is missing', () => {
    expect(mathpixLinesToBlocks({ text: 'only text' })).toEqual([]);
    expect(mathpixLinesToBlocks(null)).toEqual([]);
  });

  it('flattens Gemini questions into candidate lines plus joined runs', () => {
    const lines = geminiCandidateLines({ questions: [{ contentMmd: 'Line one\nLine two', options: [{ contentMmd: '$x$' }], answerMmd: 'B', solutionMmd: null }] });
    expect(lines.slice(0, 4)).toEqual(['Line one', 'Line two', '$x$', 'B']);
    expect(lines).toContain('Line one Line two');
  });
});

describe('reconcilePage', () => {
  const lineData = (formula: string) => ({ line_data: [
    { type: 'text', text: '1. Evaluate the integral.' },
    { type: 'math', text: formula },
    { type: 'text', text: '(a) $x$ (b) $x^2$' },
  ] });
  const gemini = (formula: string) => ({ questions: [{ contentMmd: `1. Evaluate the integral.\n$$${formula}$$`, options: [{ contentMmd: '$x$' }, { contentMmd: '$x^2$' }] }] });

  it('is CLEAN when both providers read the formula the same way', () => {
    const result = reconcilePage({ pageNumber: 3, bookName: 'Book', mathpixOutput: lineData('\\( \\int x^{2} d x \\)'), geminiStructured: gemini('\\int x^2 dx') });
    expect(result.status).toBe('CLEAN');
    expect(result.heldPrintedNumbers).toEqual([]);
    expect(result.assembly.questions[0].reviewStatus).not.toBe('HOLD');
  });

  it('holds the question that owns a disputed formula', () => {
    const result = reconcilePage({ pageNumber: 3, bookName: 'Book', mathpixOutput: lineData('\\( \\int x^{3} d x \\)'), geminiStructured: gemini('\\int x^2 dx') });
    expect(result.status).toBe('HAS_HOLDS');
    expect(result.heldPrintedNumbers).toEqual(['1']);
    expect(result.assembly.questions[0].holdReasons.some((reason) => reason.startsWith('FORMULA_PROVIDER_DISAGREEMENT'))).toBe(true);
    const record = reconciliationRecord(result);
    expect(record.status).toBe('HAS_HOLDS');
    expect(record.heldBlockDetails[0].preview).toContain('x^{3}');
  });

  it('reports INSUFFICIENT_EVIDENCE rather than holding everything when Gemini returned no questions', () => {
    const result = reconcilePage({ pageNumber: 3, bookName: 'Book', mathpixOutput: lineData('\\( \\int x^{3} d x \\)'), geminiStructured: { questions: [] } });
    expect(result.status).toBe('INSUFFICIENT_EVIDENCE');
    expect(result.heldBlocks).toBe(0);
  });
});
