import type { DiagramRegion, OcrTextLine } from './diagram-regions';

/**
 * Figures on a page read from the PDF's own text, where no image goes to Mathpix and so no figure regions come back
 * from it. The layout check that runs while the page is rendered (render-pdf-page-batch.py) already marks graph and
 * figure regions -- vector drawings and embedded pictures -- as fractions of the page; and the page's text layer
 * holds its lines the same way. Both are turned into pixels of the rendered page image, which is what the figure
 * cropper (lib/page-image-crop) and the figure-to-question matcher (lib/figure-question-match) work in.
 */

const FIGURE_KINDS: Record<string, string> = { GRAPH_REGION_CANDIDATE: 'graph', FIGURE_REGION_CANDIDATE: 'figure' };
/** A region smaller than this on either side is a rule or an icon, not a figure worth a crop. */
const MIN_SIDE_PX = 40;
/** Room around a detected drawing, so axis labels and arrowheads at its edge are not cut off. */
const PAD_PX = 10;

type LayoutRegion = { kind?: unknown; x?: unknown; y?: unknown; width?: unknown; height?: unknown };
const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null);

/** The graph and figure regions the layout check found, in pixels of the rendered page image, top to bottom. */
export function nativeFigureRegions(layoutData: unknown, imageWidth: number | null | undefined, imageHeight: number | null | undefined): DiagramRegion[] {
  const W = Number(imageWidth);
  const H = Number(imageHeight);
  if (!(W > 0) || !(H > 0) || !layoutData || typeof layoutData !== 'object') return [];
  const regions = (layoutData as { regions?: unknown }).regions;
  if (!Array.isArray(regions)) return [];
  const out: DiagramRegion[] = [];
  for (const raw of regions as LayoutRegion[]) {
    const type = typeof raw?.kind === 'string' ? FIGURE_KINDS[raw.kind] : undefined;
    const [x, y, w, h] = [num(raw?.x), num(raw?.y), num(raw?.width), num(raw?.height)];
    if (!type || x == null || y == null || w == null || h == null) continue;
    if (w * W < MIN_SIDE_PX || h * H < MIN_SIDE_PX) continue;
    // Edges to whole pixels first (fractions like 0.1 + 0.2 are not exact), then the padding, inside the page.
    const left = Math.max(0, Math.round(x * W) - PAD_PX);
    const top = Math.max(0, Math.round(y * H) - PAD_PX);
    const right = Math.min(W, Math.round((x + w) * W) + PAD_PX);
    const bottom = Math.min(H, Math.round((y + h) * H) + PAD_PX);
    out.push({ x: left, y: top, width: right - left, height: bottom - top, type });
  }
  return out.sort((a, b) => a.y - b.y || a.x - b.x);
}

/** The page's text-layer lines with their vertical positions, in pixels of the same image. */
export function nativeTextLines(textLayer: unknown, imageHeight: number | null | undefined): OcrTextLine[] {
  const H = Number(imageHeight);
  if (!(H > 0) || !textLayer || typeof textLayer !== 'object') return [];
  const lines = (textLayer as { lines?: unknown }).lines;
  if (!Array.isArray(lines)) return [];
  const out: OcrTextLine[] = [];
  for (const line of lines as Array<{ y?: unknown; h?: unknown; text?: unknown }>) {
    const [y, h] = [num(line?.y), num(line?.h)];
    const text = typeof line?.text === 'string' ? line.text.trim() : '';
    if (y == null || h == null || !text) continue;
    out.push({ top: Math.round(y * H), bottom: Math.round((y + h) * H), text });
  }
  return out;
}
