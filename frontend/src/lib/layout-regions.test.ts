import { describe, expect, it } from 'vitest';
import { countRegionKinds, hasUnlocatedGraphics, summarizeGeometry } from './layout-regions';

describe('layout-regions', () => {
  it('counts region kinds and defaults a missing kind to UNKNOWN', () => {
    expect(countRegionKinds([{ kind: 'A' }, { kind: 'A' }, {}])).toEqual({ A: 2, UNKNOWN: 1 });
  });

  it('always reports all seven geometry kinds', () => {
    const summary = summarizeGeometry({ TABLE_REGION_CANDIDATE: 2, PAGE_COLUMN: 4 });
    expect(Object.keys(summary)).toHaveLength(7);
    expect(summary.TABLE_REGION_CANDIDATE).toBe(2);
    expect(summary.GRAPH_REGION_CANDIDATE).toBe(0);
  });

  it('flags pages whose only figure or table signal is the unlocated keyword guess', () => {
    expect(hasUnlocatedGraphics({ FIGURE_OR_GRAPH_CANDIDATE: 1 })).toBe(true);
    expect(hasUnlocatedGraphics({ FIGURE_OR_GRAPH_CANDIDATE: 1, GRAPH_REGION_CANDIDATE: 1 })).toBe(false);
    expect(hasUnlocatedGraphics({ TABLE_CANDIDATE: 1 })).toBe(true);
    expect(hasUnlocatedGraphics({ TABLE_CANDIDATE: 1, TABLE_REGION_CANDIDATE: 1 })).toBe(false);
    expect(hasUnlocatedGraphics({})).toBe(false);
  });
});
