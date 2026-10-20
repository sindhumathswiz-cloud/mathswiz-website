import { fitWithin } from '@/lib/image-downscale';

/**
 * Planning for turning captured page images (screenshots of an online reader, scans, photos) into book pages.
 * Pure arithmetic and ordering, so the browser code that draws the pages stays thin and this is tested.
 */

export const MAX_IMPORT_PAGES = 1500;
/** Pages are stored at most this many pixels on their long side: legible, and a whole book still fits the upload limit. */
export const PAGE_LONG_SIDE = 1800;

/** Orders names the way a person reads them: "page2" before "page10", ignoring case. */
export function naturalCompare(a: string, b: string): number {
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
}

export function sortByName<T extends { name: string }>(files: T[]): T[] {
  return [...files].sort((x, y) => naturalCompare(x.name, y.name));
}

export type SplitMode = 'none' | 'halves';

export interface ImportOptions {
  /** Fractions (0 to 0.45) of each image's edges to cut away, e.g. a browser toolbar or the reader's own header. */
  crop: { top: number; bottom: number; left: number; right: number };
  /** "halves": each image shows a two-page spread and becomes two pages (left, then right). */
  split: SplitMode;
  /** Where the spread is divided, as a fraction of the cropped width. */
  splitAt: number;
}

export const DEFAULT_OPTIONS: ImportOptions = { crop: { top: 0, bottom: 0, left: 0, right: 0 }, split: 'none', splitAt: 0.5 };

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, Number.isFinite(value) ? value : min));

export function cleanOptions(options: ImportOptions): ImportOptions {
  const c = options.crop;
  const crop = { top: clamp(c.top, 0, 0.45), bottom: clamp(c.bottom, 0, 0.45), left: clamp(c.left, 0, 0.45), right: clamp(c.right, 0, 0.45) };
  // Never crop everything away: keep at least a tenth in each direction.
  if (crop.top + crop.bottom > 0.9) { crop.top = 0.45; crop.bottom = 0.45; }
  if (crop.left + crop.right > 0.9) { crop.left = 0.45; crop.right = 0.45; }
  return { crop, split: options.split === 'halves' ? 'halves' : 'none', splitAt: clamp(options.splitAt, 0.3, 0.7) };
}

export interface PageRect {
  /** Index of the source image. */
  source: number;
  /** The area of the source image to use, in its own pixels. */
  x: number; y: number; width: number; height: number;
  /** The size to draw the page at, after scaling down to PAGE_LONG_SIDE. */
  outWidth: number; outHeight: number;
}

/** The pages one source image becomes: its cropped area, or the two halves of it. */
export function planImage(source: number, width: number, height: number, rawOptions: ImportOptions): PageRect[] {
  const options = cleanOptions(rawOptions);
  const x0 = Math.round(width * options.crop.left);
  const y0 = Math.round(height * options.crop.top);
  const w = Math.max(1, Math.round(width * (1 - options.crop.left - options.crop.right)));
  const h = Math.max(1, Math.round(height * (1 - options.crop.top - options.crop.bottom)));
  const areas = options.split === 'halves'
    ? (() => { const cut = Math.round(w * options.splitAt); return [{ x: x0, y: y0, width: cut, height: h }, { x: x0 + cut, y: y0, width: w - cut, height: h }]; })()
    : [{ x: x0, y: y0, width: w, height: h }];
  return areas.map((area) => {
    const out = fitWithin(area.width, area.height, PAGE_LONG_SIDE);
    return { source, ...area, outWidth: Math.max(1, out.width), outHeight: Math.max(1, out.height) };
  });
}

export function planImport(sizes: Array<{ width: number; height: number }>, options: ImportOptions): PageRect[] {
  return sizes.flatMap((size, index) => planImage(index, size.width, size.height, options));
}

/** A screenshot much wider than tall is almost certainly an open book showing two pages. */
export const looksLikeSpread = (width: number, height: number) => width / height > 1.25;

export type ImportProblem = { level: 'error' | 'warning'; message: string };

/** Checks before any work is done: how many pages it will make and whether that is workable. */
export function checkImport(sourceCount: number, options: ImportOptions, firstSize?: { width: number; height: number }): ImportProblem[] {
  const problems: ImportProblem[] = [];
  const pages = sourceCount * (cleanOptions(options).split === 'halves' ? 2 : 1);
  if (sourceCount === 0) problems.push({ level: 'error', message: 'Choose the page images first.' });
  if (pages > MAX_IMPORT_PAGES) problems.push({ level: 'error', message: `That would make ${pages} pages; the limit is ${MAX_IMPORT_PAGES}. Import the book in parts.` });
  if (firstSize && cleanOptions(options).split === 'none' && looksLikeSpread(firstSize.width, firstSize.height)) {
    problems.push({ level: 'warning', message: 'These images are wider than they are tall, so each may show a two-page spread. Turn on "Split each image into two pages" if so.' });
  }
  if (firstSize && cleanOptions(options).split === 'halves' && !looksLikeSpread(firstSize.width, firstSize.height)) {
    problems.push({ level: 'warning', message: 'These images look like single pages, but splitting is on: each will be cut in half.' });
  }
  return problems;
}

/** "3 images → 6 pages" for the summary line. */
export function describePlan(sourceCount: number, options: ImportOptions): string {
  const pages = sourceCount * (cleanOptions(options).split === 'halves' ? 2 : 1);
  return `${sourceCount} image${sourceCount === 1 ? '' : 's'} → ${pages} page${pages === 1 ? '' : 's'}`;
}
