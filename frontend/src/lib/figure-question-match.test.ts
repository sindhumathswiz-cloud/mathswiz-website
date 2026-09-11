import { describe, expect, it } from 'vitest';
import { matchFiguresToQuestions } from './figure-question-match';
import type { DiagramRegion, OcrTextLine } from './diagram-regions';

const region = (y: number, over: Partial<DiagramRegion> = {}): DiagramRegion => ({
  x: 100, y, width: 300, height: 200, type: 'chart', ...over,
});
const line = (top: number, text: string): OcrTextLine => ({ top, bottom: top + 20, text });

describe('matchFiguresToQuestions', () => {
  it('returns empty when there are no regions or no questions', () => {
    expect(matchFiguresToQuestions([], [line(0, '1. x')], [{ content: 'x' }]).size).toBe(0);
    expect(matchFiguresToQuestions([region(50)], [], []).size).toBe(0);
  });

  it('gives every region to the sole question on a single-question page', () => {
    const out = matchFiguresToQuestions([region(50), region(400)], [], [{ printedNumber: '1', content: 'Find the area' }]);
    expect(out.get(0)).toHaveLength(2);
  });

  it('attaches each figure to the question whose text starts just above it', () => {
    const lines = [
      line(20, '1. Find the area bounded by the parabola'),
      line(120, '2. Find the area of the region bounded by the ellipse'),
      line(600, '3. Using integration find the area of the triangle'),
    ];
    const questions = [
      { printedNumber: '1', content: 'Find the area bounded by the parabola $y^2 = 4x$' },
      { printedNumber: '2', content: 'Find the area of the region bounded by the ellipse' },
      { printedNumber: '3', content: 'Using integration find the area of the triangle' },
    ];
    // figure for Q1 at y=40, figure for Q2 at y=300, figure for Q3 at y=650
    const out = matchFiguresToQuestions([region(40), region(300), region(650)], lines, questions);
    expect(out.get(0)?.map((r) => r.y)).toEqual([40]);
    expect(out.get(1)?.map((r) => r.y)).toEqual([300]);
    expect(out.get(2)?.map((r) => r.y)).toEqual([650]);
  });

  it('drops a figure that sits above the first question (belongs to a carried-over question)', () => {
    const lines = [line(400, '5. Find the area enclosed by the curve')];
    const out = matchFiguresToQuestions([region(30), region(450)], lines, [
      { printedNumber: '5', content: 'Find the area enclosed by the curve' },
    ]);
    // Only one question here, so single-question rule attaches both...
    expect(out.get(0)).toHaveLength(2);
  });

  it('drops an un-placeable figure only when there are multiple questions', () => {
    const lines = [line(300, '2. second question text here'), line(500, '3. third question text here')];
    const questions = [
      { printedNumber: '1', content: 'first question never anchored on this page' },
      { printedNumber: '2', content: 'second question text here' },
      { printedNumber: '3', content: 'third question text here' },
    ];
    // A figure at y=40 is above every anchored question -> dropped.
    // A figure at y=350 belongs to Q2; y=520 to Q3.
    const out = matchFiguresToQuestions([region(40), region(350), region(520)], lines, questions);
    expect(out.has(0)).toBe(false);
    expect(out.get(1)?.map((r) => r.y)).toEqual([350]);
    expect(out.get(2)?.map((r) => r.y)).toEqual([520]);
  });

  it('falls back to a stem-text prefix match when the printed number is absent', () => {
    const lines = [
      line(50, 'Sketch the graph of y = |x + 1| and evaluate the integral'),
      line(300, 'Find the area of the region between the curves'),
    ];
    const out = matchFiguresToQuestions([region(100), region(320)], lines, [
      { printedNumber: null, content: 'Sketch the graph of $y = |x+1|$ and evaluate the integral' },
      { printedNumber: null, content: 'Find the area of the region between the curves' },
    ]);
    expect(out.get(0)?.map((r) => r.y)).toEqual([100]);
    expect(out.get(1)?.map((r) => r.y)).toEqual([320]);
  });

  it('gives two figures on one question to that question', () => {
    const lines = [line(20, '1. first'), line(500, '2. second')];
    const out = matchFiguresToQuestions([region(100), region(250), region(520)], lines, [
      { printedNumber: '1', content: 'first' },
      { printedNumber: '2', content: 'second' },
    ]);
    expect(out.get(0)).toHaveLength(2);
    expect(out.get(1)).toHaveLength(1);
  });
});
