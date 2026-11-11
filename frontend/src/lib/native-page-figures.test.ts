import { describe, expect, it } from 'vitest';
import { nativeFigureRegions, nativeTextLines } from './native-page-figures';

// As render-pdf-page-batch.py stores them: fractions of the page.
const layout = {
  regions: [
    { kind: 'PAGE_COLUMN', x: 0.04, y: 0.04, width: 0.44, height: 0.92 },
    { kind: 'GRAPH_REGION_CANDIDATE', x: 0.15787, y: 0.60974, width: 0.1459, height: 0.23997, evidence: 'vector drawing: 12 curve(s)' },
    { kind: 'FIGURE_REGION_CANDIDATE', x: 0.5, y: 0.1, width: 0.3, height: 0.12 },
    { kind: 'GRAPH_REGION_CANDIDATE', x: 0.2, y: 0.3, width: 0.01, height: 0.2 }, // a rule, too thin to be a figure
    { kind: 'TABLE_REGION_CANDIDATE', x: 0.1, y: 0.4, width: 0.4, height: 0.1 },
  ],
};

describe('nativeFigureRegions', () => {
  it('turns the graph and figure regions into padded pixels of the page image, top to bottom', () => {
    const regions = nativeFigureRegions(layout, 1163, 1500);
    expect(regions).toEqual([
      { x: 572, y: 140, width: 368, height: 200, type: 'figure' },
      { x: 174, y: 905, width: 189, height: 380, type: 'graph' },
    ]);
  });

  it('keeps a padded region inside the page', () => {
    const [edge] = nativeFigureRegions({ regions: [{ kind: 'FIGURE_REGION_CANDIDATE', x: 0, y: 0.9, width: 0.5, height: 0.1 }] }, 1000, 1000);
    expect(edge).toEqual({ x: 0, y: 890, width: 510, height: 110, type: 'figure' });
  });

  it('has nothing for a page without a layout or a size', () => {
    expect(nativeFigureRegions(null, 1163, 1500)).toEqual([]);
    expect(nativeFigureRegions(layout, null, 1500)).toEqual([]);
    expect(nativeFigureRegions({ regions: 'x' }, 1163, 1500)).toEqual([]);
  });
});

describe('nativeTextLines', () => {
  it('gives each text-layer line its top and bottom in pixels', () => {
    const layer = { version: 1, source: 'NATIVE_PDF', lines: [{ x: 0.1, y: 0.5, w: 0.4, h: 0.02, text: ' 12. The graph of f(x) = |x - 2| is ' }, { x: 0, y: 0.6, w: 0.1, h: 0.01, text: '' }] };
    expect(nativeTextLines(layer, 1500)).toEqual([{ top: 750, bottom: 780, text: '12. The graph of f(x) = |x - 2| is' }]);
    expect(nativeTextLines(null, 1500)).toEqual([]);
  });
});
