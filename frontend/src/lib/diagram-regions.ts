/**
 * Parses Mathpix's `line_data` response (requested via
 * `data_options.include_line_data`) into the bounding boxes of the
 * non-text regions worth cropping out as a QuestionImage — diagrams,
 * charts, graphs, and other figures.
 *
 * Kept as its own pure module (rather than inlined into
 * extract-book-page.ts's Mathpix call) so it's independently testable, and
 * because Mathpix's exact `line_data` type vocabulary isn't something this
 * codebase has been able to verify against a live response yet — isolating
 * the parsing here means that vocabulary can be corrected in one place
 * (this file's DIAGRAM_TYPE_ALLOWLIST) if real responses turn out to use
 * different type names, without touching the OCR call or extraction route
 * that consume its output. Deliberately defensive throughout: any
 * unexpected shape is skipped rather than thrown on, since a parsing miss
 * here should degrade to "no image captured" (the pre-existing behavior),
 * never break question extraction itself.
 */

export interface MathpixLineDatum {
  type?: unknown;
  cnt?: unknown;
  [key: string]: unknown;
}

export interface DiagramRegion {
  // Pixel coordinates in the space of the page image that was sent to
  // Mathpix for OCR — i.e. directly usable as input to
  // lib/page-image-crop.ts's cropPageRegion against that same image.
  x: number;
  y: number;
  width: number;
  height: number;
  type: string;
}

export interface OcrTextLine {
  // Top / bottom (min-Y / max-Y) pixel coordinates of this line's bounding
  // box, in the SAME OCR-image space as DiagramRegion above — so a figure
  // region and a text line can be compared vertically directly.
  top: number;
  bottom: number;
  // The OCR'd text of the line, trimmed. Used to anchor a structured
  // question to its vertical position on the page (see figure-question-match.ts).
  text: string;
}

// Mathpix's documented line "type" values include figure-ish kinds beyond
// plain text/equations/tables; this allowlist is intentionally broad and
// lower-cased for comparison. Tables are excluded on purpose — a table is
// better represented as text/markdown than as a cropped image, and Mathpix
// already extracts table content separately.
const DIAGRAM_TYPE_ALLOWLIST = new Set(['diagram', 'chart', 'picture', 'figure', 'graph', 'image']);

// Below this many pixels in either dimension, a "region" is more likely a
// stray mark or OCR noise than a real figure worth cropping and storing.
const MIN_REGION_DIMENSION_PX = 40;
// ...and below this area (covers a long thin sliver that passes the
// per-dimension check above), same reasoning.
const MIN_REGION_AREA_PX = 4000;

function boundingBoxFromContour(cnt: unknown): { minX: number; minY: number; maxX: number; maxY: number } | null {
  if (!Array.isArray(cnt) || cnt.length === 0) return null;
  const xs: number[] = [];
  const ys: number[] = [];
  for (const point of cnt) {
    if (!Array.isArray(point) || point.length < 2) continue;
    const x = Number(point[0]);
    const y = Number(point[1]);
    if (Number.isFinite(x) && Number.isFinite(y)) {
      xs.push(x);
      ys.push(y);
    }
  }
  if (xs.length === 0 || ys.length === 0) return null;
  return { minX: Math.min(...xs), minY: Math.min(...ys), maxX: Math.max(...xs), maxY: Math.max(...ys) };
}

export function parseDiagramRegions(lineData: unknown): DiagramRegion[] {
  if (!Array.isArray(lineData)) return [];

  const regions: DiagramRegion[] = [];
  for (const raw of lineData) {
    if (!raw || typeof raw !== 'object') continue;
    const datum = raw as MathpixLineDatum;
    const type = typeof datum.type === 'string' ? datum.type.toLowerCase() : '';
    if (!DIAGRAM_TYPE_ALLOWLIST.has(type)) continue;

    const box = boundingBoxFromContour(datum.cnt);
    if (!box) continue;
    const width = box.maxX - box.minX;
    const height = box.maxY - box.minY;
    if (width < MIN_REGION_DIMENSION_PX || height < MIN_REGION_DIMENSION_PX) continue;
    if (width * height < MIN_REGION_AREA_PX) continue;

    regions.push({ x: box.minX, y: box.minY, width, height, type });
  }
  return regions;
}

/**
 * Parses the TEXT lines out of the same `line_data` response — every entry
 * that carries readable text and a bounding contour, excluding the
 * figure/table kinds parseDiagramRegions handles. Returned sorted
 * top-to-bottom. Used to work out where on the page each structured question
 * begins, so a figure region can be attached to the right question on a
 * multi-question page (figure-question-match.ts).
 *
 * Same defensive contract as parseDiagramRegions: any unexpected shape is
 * skipped, never thrown on — a parsing miss degrades to "couldn't place the
 * figure" (no image attached), never a broken extraction.
 */
export function parseOcrTextLines(lineData: unknown): OcrTextLine[] {
  if (!Array.isArray(lineData)) return [];

  const lines: OcrTextLine[] = [];
  for (const raw of lineData) {
    if (!raw || typeof raw !== 'object') continue;
    const datum = raw as MathpixLineDatum;
    const type = typeof datum.type === 'string' ? datum.type.toLowerCase() : '';
    if (DIAGRAM_TYPE_ALLOWLIST.has(type) || type === 'table') continue;

    const text = typeof datum.text === 'string' ? datum.text.trim() : '';
    if (!text) continue;

    const box = boundingBoxFromContour(datum.cnt);
    if (!box) continue;

    lines.push({ top: box.minY, bottom: box.maxY, text });
  }
  return lines.sort((a, b) => a.top - b.top);
}
