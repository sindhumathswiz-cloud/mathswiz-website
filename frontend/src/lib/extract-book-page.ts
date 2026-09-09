import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { assertPrivatePageImagePath } from './book-storage';
import { cleanMathpixMarkdown } from './mathpix-parser';
import { structureQuestions } from './structure-questions';
import { analyzeQuestion, type QAIssue } from './question-qa';
import { computeContentHash } from './question-classifier';
import { parseDiagramRegions, type DiagramRegion } from './diagram-regions';
import type { CanonicalQuestion } from './extract-normalizer';

/**
 * Turns one already-rendered book page into canonical, QA-checked questions —
 * the missing link between the render/benchmark pipeline (pdf-page-renderer.ts,
 * book-vision-benchmark.ts) and actual Question rows. Two raw-text sources are
 * supported per page, cheapest first:
 *
 *  1. NATIVE_TEXT — the PDF's own embedded text layer (pdf-page-renderer.ts's
 *     `nativeText`). Free and instant; used whenever the local layout analyzer
 *     did not flag the page as needing vision segmentation and there's enough
 *     text to be worth trusting.
 *  2. MATHPIX_OCR — a page-image OCR call, for scanned/photographed pages or
 *     pages the layout analyzer flagged (`requiresVisionSegmentation`).
 *
 * Either way the resulting text is run through the SAME structuring pipeline
 * (structure-questions.ts -> extract-normalizer.ts) used by the other
 * extraction routes, so behavior stays consistent across entry points.
 *
 * Raw-text acquisition (getPageRawText) and LLM structuring
 * (structurePageQuestions) are exposed as separate steps, not just bundled
 * into extractQuestionsFromPage below, so a caller processing many pages in
 * order (extract-questions/route.ts) can inspect or stitch raw text across a
 * page boundary — e.g. a CASE_STUDY passage split across two printed pages —
 * before it ever reaches the LLM.
 */

export type PageOcrProvider = 'NATIVE_TEXT' | 'MATHPIX_OCR';

export interface PageForExtraction {
  pageNumber: number;
  nativeText: string | null;
  pageImagePath: string | null;
  processedImagePath: string | null;
  requiresVisionSegmentation: boolean;
}

export interface PageRawText {
  provider: PageOcrProvider;
  rawText: string;
  ocrConfidence: number | null;
  // Non-text regions (diagrams/charts/figures/graphs) Mathpix's line_data
  // flagged on this page, in the pixel space of ocrImagePath — [] when this
  // page used the native text layer (no image was OCR'd, so there's nothing
  // to detect regions in) or when OCR found none.
  diagramRegions: DiagramRegion[];
  // The page image these diagramRegions' coordinates are relative to — the
  // same file a caller must pass to lib/page-image-crop.ts's
  // cropPageRegion to actually cut one out. null when provider is
  // NATIVE_TEXT (no image was OCR'd).
  ocrImagePath: string | null;
}

export interface ExtractedPageQuestion {
  question: CanonicalQuestion;
  contentHash: string;
  qaIssues: QAIssue[];
}

export interface PageExtractionResult extends PageRawText {
  questions: ExtractedPageQuestion[];
}

// Below this many characters, a page's native text layer is more likely blank
// or garbage (e.g. a diagram-only page) than a usable transcription — OCR the
// page image instead rather than structuring near-nothing.
const MIN_NATIVE_TEXT_CHARS = 40;

function imageMime(filePath: string): string {
  const extension = path.extname(filePath).toLowerCase();
  if (extension === '.png') return 'image/png';
  if (extension === '.webp') return 'image/webp';
  return 'image/jpeg';
}

async function ocrPageWithMathpix(imagePath: string): Promise<{ text: string; confidence: number | null; diagramRegions: DiagramRegion[]; safeImagePath: string }> {
  const safePath = assertPrivatePageImagePath(imagePath);
  if (!process.env.MATHPIX_APP_ID || !process.env.MATHPIX_APP_KEY) {
    throw new Error('Mathpix credentials are not configured (MATHPIX_APP_ID / MATHPIX_APP_KEY)');
  }
  const bytes = await readFile(safePath);
  const form = new FormData();
  form.set('file', new Blob([bytes], { type: imageMime(safePath) }), path.basename(safePath));
  form.set('options_json', JSON.stringify({
    formats: ['text'],
    rm_spaces: false,
    math_inline_delimiters: ['\\(', '\\)'],
    math_display_delimiters: ['\\[', '\\]'],
    // line_data carries per-line type + bounding-contour data, including
    // non-text lines (diagrams/charts/figures) that `formats: ['text']`
    // alone silently drops. Requesting it is what makes image capture
    // possible at all; see diagram-regions.ts for how it's interpreted.
    // This is a TOP-LEVEL request field, not a member of `data_options`
    // (that object only accepts specific `include_*` keys for the `data`
    // field's math/table sub-formats — asciimath, latex, mathml, tsv,
    // table_html — and rejects unknown ones, which is what nesting this
    // under it did: Mathpix's real API returned
    // `Unknown: "include_line_data"` for every single page, silently
    // failing the whole extraction run since callers only surface
    // saved/duplicate/needsReview counts, not per-page failures).
    include_line_data: true,
  }));
  const response = await fetch('https://api.mathpix.com/v3/text', {
    method: 'POST',
    headers: { app_id: process.env.MATHPIX_APP_ID, app_key: process.env.MATHPIX_APP_KEY },
    body: form,
    signal: AbortSignal.timeout(90_000),
  });
  const output = await response.json();
  if (!response.ok || output.error) throw new Error(output.error || `Mathpix returned ${response.status}`);
  const text = typeof output.text === 'string' ? output.text : '';
  return {
    text: cleanMathpixMarkdown(text),
    confidence: typeof output.confidence === 'number' ? output.confidence : null,
    diagramRegions: parseDiagramRegions(output.line_data),
    safeImagePath: safePath,
  };
}

/**
 * Step 1: resolve a rendered page's raw transcribed text (native PDF text
 * layer when trustworthy, otherwise a Mathpix OCR call on the page image).
 * Split out from structuring below so a caller can stitch two pages' raw
 * text together before it reaches the LLM.
 */
export async function getPageRawText(page: PageForExtraction): Promise<PageRawText> {
  const nativeText = (page.nativeText || '').trim();
  const trustNativeText = !page.requiresVisionSegmentation && nativeText.length >= MIN_NATIVE_TEXT_CHARS;

  if (trustNativeText) {
    // A trustworthy native text layer means we never looked at the page
    // image, so there's no OCR line data to detect figures in — a page
    // with a diagram AND enough surrounding native text to pass the trust
    // threshold above will not get its diagram captured. Acceptable
    // trade-off for now: re-running OCR on every text-trustworthy page
    // just to catch this would multiply Mathpix cost across the whole
    // book for a comparatively rare page shape.
    return { provider: 'NATIVE_TEXT', rawText: nativeText, ocrConfidence: null, diagramRegions: [], ocrImagePath: null };
  }

  const imagePath = page.processedImagePath || page.pageImagePath;
  if (!imagePath) {
    // Nothing usable on this page: no trustworthy text layer and no image to OCR.
    return { provider: 'NATIVE_TEXT', rawText: '', ocrConfidence: null, diagramRegions: [], ocrImagePath: null };
  }
  const ocr = await ocrPageWithMathpix(imagePath);
  return {
    provider: 'MATHPIX_OCR',
    rawText: ocr.text,
    ocrConfidence: ocr.confidence,
    diagramRegions: ocr.diagramRegions,
    ocrImagePath: ocr.safeImagePath,
  };
}

/**
 * Step 2: structure already-resolved raw text into canonical, QA-checked
 * questions. `rawText` may be a single page's text, or a caller-assembled
 * combination of several pages' text (case-study stitching).
 *
 * `distrustEmpty` (from a confirmed chapter manifest) forces the provider
 * fallback chain to keep going when a model returns a parseable-but-empty
 * result for a page known to contain questions — see structureQuestions.
 */
export async function structurePageQuestions(rawText: string, opts: { distrustEmpty?: boolean } = {}): Promise<ExtractedPageQuestion[]> {
  if (!rawText.trim()) return [];

  const canonicalQuestions = await structureQuestions(rawText, opts);
  return canonicalQuestions.map((question) => ({
    question,
    contentHash: computeContentHash(question.questionContent),
    qaIssues: analyzeQuestion({
      content: question.questionContent,
      options: question.options,
      correctAnswer: question.correctAnswer,
      explanation: question.explanation,
      type: question.type,
    }),
  }));
}

/**
 * Convenience wrapper combining both steps for a single page processed in
 * isolation. Callers that need cross-page stitching (extract-questions'
 * route) use getPageRawText/structurePageQuestions directly instead.
 */
export async function extractQuestionsFromPage(page: PageForExtraction): Promise<PageExtractionResult> {
  const raw = await getPageRawText(page);
  const questions = await structurePageQuestions(raw.rawText);
  return { ...raw, questions };
}
