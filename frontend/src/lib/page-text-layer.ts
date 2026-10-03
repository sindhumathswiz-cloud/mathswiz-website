import type { Prisma } from '@prisma/client';
import { cleanMathpixMarkdown } from './mathpix-parser';

/**
 * The positioned, selectable text behind the page-faithful source viewer.
 *
 * The rendered page image is the visual source of truth (so the layout is
 * identical to the PDF by construction); this layer is what lets an admin
 * select text at its printed position and paste it into the question bank.
 * Coordinates are fractions of the page (0-1, top-left origin), so they hold at
 * any display size and for any page image resolution.
 *
 * Two sources fill it:
 *  - NATIVE_PDF  words from the PDF's own text layer (free; built while the
 *                page is rendered). Math in these is only as good as the PDF's
 *                encoding, so `garbled` records how many glyphs are unmapped.
 *  - MATHPIX_OCR lines from Mathpix `line_data`, with math as LaTeX in the same
 *                `$...$` convention the extraction pipeline stores.
 */

export const TEXT_LAYER_VERSION = 1;

/**
 * Prisma `data` fragment that stores a layer, or nothing when there is none --
 * a re-run that found no positions must not erase a layer a previous run built.
 */
export function textLayerUpdate(layer: PageTextLayer | null | undefined): { textLayer?: Prisma.InputJsonValue } {
  return layer ? { textLayer: layer as unknown as Prisma.InputJsonValue } : {};
}

export type TextLayerSource = 'NATIVE_PDF' | 'MATHPIX_OCR';
export type TextLayerLineKind = 'text' | 'math' | 'table';

export interface TextLayerLine {
  x: number;
  y: number;
  w: number;
  h: number;
  // Exactly what a copy of this line produces.
  text: string;
  kind: TextLayerLineKind;
  // Native source only: [x, width, text] per word, so a selection can start
  // or end mid-line. OCR lines are atomic (selecting part of a formula would
  // split its LaTeX).
  words?: Array<[number, number, string]>;
}

export interface PageTextLayer {
  version: typeof TEXT_LAYER_VERSION;
  source: TextLayerSource;
  garbled?: number;
  lines: TextLayerLine[];
}

// Share of unmapped (private-use / replacement) glyphs above which the native
// text is not worth pasting and the OCR layer should be built instead.
export const GARBLED_NATIVE_THRESHOLD = 0.08;

const unit = (value: unknown): number | null => {
  const n = typeof value === 'number' ? value : Number.NaN;
  return Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : null;
};

function parseWords(value: unknown): Array<[number, number, string]> | undefined {
  if (!Array.isArray(value)) return undefined;
  const words: Array<[number, number, string]> = [];
  for (const word of value) {
    if (!Array.isArray(word) || word.length < 3) continue;
    const x = unit(word[0]);
    const w = unit(word[1]);
    if (x === null || w === null || typeof word[2] !== 'string') continue;
    words.push([x, w, word[2]]);
  }
  return words.length > 0 ? words : undefined;
}

/** Validates a layer read back from the database; anything malformed is dropped. */
export function parseTextLayer(value: unknown): PageTextLayer | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  if (record.version !== TEXT_LAYER_VERSION) return null;
  if (record.source !== 'NATIVE_PDF' && record.source !== 'MATHPIX_OCR') return null;
  if (!Array.isArray(record.lines)) return null;

  const lines: TextLayerLine[] = [];
  for (const raw of record.lines) {
    if (!raw || typeof raw !== 'object') continue;
    const line = raw as Record<string, unknown>;
    const x = unit(line.x);
    const y = unit(line.y);
    const w = unit(line.w);
    const h = unit(line.h);
    if (x === null || y === null || w === null || h === null || typeof line.text !== 'string' || !line.text.trim()) continue;
    const kind: TextLayerLineKind = line.kind === 'math' || line.kind === 'table' ? line.kind : 'text';
    lines.push({ x, y, w, h, text: line.text, kind, ...(parseWords(line.words) ? { words: parseWords(line.words) } : {}) });
  }
  const garbled = typeof record.garbled === 'number' && Number.isFinite(record.garbled) ? record.garbled : undefined;
  return { version: TEXT_LAYER_VERSION, source: record.source, ...(garbled !== undefined ? { garbled } : {}), lines };
}

export function nativeLayerIsUsable(layer: PageTextLayer | null): boolean {
  return Boolean(layer && layer.lines.length > 0 && (layer.garbled ?? 0) < GARBLED_NATIVE_THRESHOLD);
}

const NON_TEXT_TYPES = new Set(['diagram', 'chart', 'picture', 'figure', 'graph', 'image']);
const MATH_TYPES = new Set(['math', 'equation', 'equation_number', 'chemistry', 'chemistry_reaction']);

interface MathpixLine {
  type?: unknown;
  cnt?: unknown;
  text?: unknown;
  text_display?: unknown;
}

function contourBox(cnt: unknown): { minX: number; minY: number; maxX: number; maxY: number } | null {
  if (!Array.isArray(cnt)) return null;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const point of cnt) {
    if (!Array.isArray(point) || point.length < 2) continue;
    const x = Number(point[0]);
    const y = Number(point[1]);
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
    minX = Math.min(minX, x); maxX = Math.max(maxX, x);
    minY = Math.min(minY, y); maxY = Math.max(maxY, y);
  }
  return Number.isFinite(minX) ? { minX, minY, maxX, maxY } : null;
}

const round = (value: number) => Math.round(value * 100000) / 100000;

/**
 * Turns Mathpix `line_data` (pixel contours in the OCR'd image) into a text
 * layer. `imageWidth`/`imageHeight` are the dimensions of the image that was
 * sent to Mathpix, which is what normalises the contours to page fractions.
 * Mathpix returns lines in reading order, so array order is kept.
 */
export function layerFromMathpixLines(lineData: unknown, imageWidth: number, imageHeight: number): PageTextLayer | null {
  if (!Array.isArray(lineData) || !(imageWidth > 0) || !(imageHeight > 0)) return null;
  const lines: TextLayerLine[] = [];
  for (const raw of lineData) {
    if (!raw || typeof raw !== 'object') continue;
    const datum = raw as MathpixLine;
    const type = typeof datum.type === 'string' ? datum.type.toLowerCase() : '';
    if (NON_TEXT_TYPES.has(type)) continue;
    const source = typeof datum.text === 'string' ? datum.text : typeof datum.text_display === 'string' ? datum.text_display : '';
    let text = cleanMathpixMarkdown(source).trim();
    if (!text) continue;
    const box = contourBox(datum.cnt);
    if (!box) continue;

    const kind: TextLayerLineKind = type === 'table' ? 'table' : MATH_TYPES.has(type) ? 'math' : 'text';
    // A math line must paste as math even if Mathpix returned bare LaTeX.
    if (kind === 'math' && !text.includes('$')) text = `$${text}$`;

    const x = Math.max(0, box.minX / imageWidth);
    const y = Math.max(0, box.minY / imageHeight);
    lines.push({
      x: round(x),
      y: round(y),
      w: round(Math.min(1 - x, (box.maxX - box.minX) / imageWidth)),
      h: round(Math.min(1 - y, (box.maxY - box.minY) / imageHeight)),
      text,
      kind,
    });
  }
  return lines.length > 0 ? { version: TEXT_LAYER_VERSION, source: 'MATHPIX_OCR', lines } : null;
}

/**
 * Text for a selection: lines in the order given, one per line, with a blank
 * line where there is a clear paragraph gap so pasted questions keep their
 * shape. Lines are expected in reading order.
 */
export function joinSelectedLines(lines: Array<Pick<TextLayerLine, 'y' | 'h' | 'text'> & { page?: number }>): string {
  let out = '';
  let previous: (typeof lines)[number] | null = null;
  for (const line of lines) {
    if (previous) {
      const crossedPage = previous.page !== undefined && line.page !== undefined && previous.page !== line.page;
      const gap = line.y - (previous.y + previous.h);
      out += crossedPage || gap > Math.max(previous.h, line.h) * 0.9 ? '\n\n' : '\n';
    }
    out += line.text;
    previous = line;
  }
  return out;
}
