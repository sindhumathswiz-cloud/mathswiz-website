/**
 * Region kinds produced by scripts/render-pdf-page-batch.py and
 * scripts/page_geometry.py, and how the admin layout summary groups them.
 */
export const GEOMETRY_REGION_KINDS = [
  'QUESTION_REGION_CANDIDATE',
  'OPTION_REGION_CANDIDATE',
  'ANSWER_REGION_CANDIDATE',
  'SOLUTION_REGION_CANDIDATE',
  'GRAPH_REGION_CANDIDATE',
  'FIGURE_REGION_CANDIDATE',
  'TABLE_REGION_CANDIDATE',
] as const;

export type GeometryRegionKind = typeof GEOMETRY_REGION_KINDS[number];

export function countRegionKinds(regions: Array<{ kind?: unknown }>): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const region of regions) {
    const kind = String(region.kind || 'UNKNOWN');
    counts[kind] = (counts[kind] || 0) + 1;
  }
  return counts;
}

/** Counts for the seven geometry kinds, always present (zero when absent). */
export function summarizeGeometry(regionTypes: Record<string, number>): Record<GeometryRegionKind, number> {
  return Object.fromEntries(GEOMETRY_REGION_KINDS.map((kind) => [kind, regionTypes[kind] || 0])) as Record<GeometryRegionKind, number>;
}

/**
 * Pages whose only figure/table signal is the old keyword guess (no box):
 * these still need a human or vision pass to locate the region.
 */
export function hasUnlocatedGraphics(regionCounts: Record<string, number>): boolean {
  const locatedFigure = (regionCounts.FIGURE_REGION_CANDIDATE || 0) + (regionCounts.GRAPH_REGION_CANDIDATE || 0) > 0;
  const locatedTable = (regionCounts.TABLE_REGION_CANDIDATE || 0) > 0;
  return ((regionCounts.FIGURE_OR_GRAPH_CANDIDATE || 0) > 0 && !locatedFigure) || ((regionCounts.TABLE_CANDIDATE || 0) > 0 && !locatedTable);
}
