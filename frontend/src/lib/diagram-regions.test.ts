import { describe, expect, it } from 'vitest';
import { parseDiagramRegions } from './diagram-regions';

function diagramLine(overrides: Record<string, unknown> = {}) {
  return {
    type: 'diagram',
    cnt: [[100, 200], [300, 200], [300, 400], [100, 400]],
    ...overrides,
  };
}

describe('parseDiagramRegions', () => {
  it('returns an empty array for missing or non-array input', () => {
    expect(parseDiagramRegions(undefined)).toEqual([]);
    expect(parseDiagramRegions(null)).toEqual([]);
    expect(parseDiagramRegions('not an array')).toEqual([]);
    expect(parseDiagramRegions({})).toEqual([]);
  });

  it('extracts a bounding box from a diagram line\'s contour', () => {
    const regions = parseDiagramRegions([diagramLine()]);
    expect(regions).toEqual([{ x: 100, y: 200, width: 200, height: 200, type: 'diagram' }]);
  });

  it('accepts other figure-ish types: chart, picture, figure, graph, image', () => {
    const types = ['chart', 'picture', 'figure', 'graph', 'image'];
    const lines = types.map(type => diagramLine({ type }));
    const regions = parseDiagramRegions(lines);
    expect(regions.map(r => r.type)).toEqual(types);
  });

  it('skips text and table lines', () => {
    const lines = [diagramLine({ type: 'text' }), diagramLine({ type: 'table' }), diagramLine({ type: 'equation' })];
    expect(parseDiagramRegions(lines)).toEqual([]);
  });

  it('is case-insensitive on type', () => {
    const regions = parseDiagramRegions([diagramLine({ type: 'DIAGRAM' })]);
    expect(regions).toHaveLength(1);
  });

  it('drops a region with no usable contour points', () => {
    expect(parseDiagramRegions([diagramLine({ cnt: [] })])).toEqual([]);
    expect(parseDiagramRegions([diagramLine({ cnt: undefined })])).toEqual([]);
    expect(parseDiagramRegions([diagramLine({ cnt: 'not an array' })])).toEqual([]);
  });

  it('ignores malformed points within an otherwise valid contour', () => {
    const regions = parseDiagramRegions([diagramLine({ cnt: [[100, 200], 'garbage', [300, 400], [NaN, 50]] })]);
    expect(regions).toEqual([{ x: 100, y: 200, width: 200, height: 200, type: 'diagram' }]);
  });

  it('drops regions smaller than the minimum dimension threshold', () => {
    const tiny = diagramLine({ cnt: [[0, 0], [10, 0], [10, 10], [0, 10]] });
    expect(parseDiagramRegions([tiny])).toEqual([]);
  });

  it('drops thin slivers that pass the per-dimension check but fail the area check', () => {
    // 45px tall but only 5px wide: area = 225, well under the 4000px^2 floor.
    const sliver = diagramLine({ cnt: [[0, 0], [5, 0], [5, 45], [0, 45]] });
    expect(parseDiagramRegions([sliver])).toEqual([]);
  });

  it('skips non-object entries in the line data array', () => {
    expect(parseDiagramRegions([null, 42, 'x', diagramLine()])).toHaveLength(1);
  });
});
