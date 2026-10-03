import type { OcrBlock } from './book-semantic-assembler';
import { geminiCandidateLines, mathpixLinesToBlocks, type GeminiPage } from './page-reconciliation';

/**
 * Provider agreement should never force new OCR spend. Instead of requiring
 * both benchmarks to be run, this looks at what a page ALREADY has and picks
 * the best independent pair from it:
 *
 *   - a Mathpix reading: the Mathpix benchmark (line-level, typed blocks) if
 *     one exists, otherwise the Mathpix OCR text the book extraction already
 *     stored on the page (DocumentPage.rawMarkdown, ocrProvider MATHPIX_OCR);
 *   - a Gemini reading: the Gemini vision benchmark's structured output.
 *
 * Two readings from the same provider are not independent, so a page with
 * only Mathpix (or only Gemini) is reported as a single reading and left
 * alone. The embedded text layer (NATIVE_TEXT) is deliberately not used: it
 * carries no LaTeX, so every formula would "disagree" for style alone.
 */

export type PageEvidence = {
  benchmarks: Array<{ provider: string; rawOutput?: unknown; structuredData?: unknown }>;
  extraction: { provider: string | null; rawMarkdown: string | null } | null;
};

export type MathpixReading = { origin: 'BENCHMARK' | 'EXTRACTION'; blocks: OcrBlock[] };

export type ReadingSelection =
  | { coverage: 'READY'; mathpix: MathpixReading; gemini: GeminiPage; candidates: string[] }
  | { coverage: 'SINGLE_READING'; has: 'MATHPIX_OCR' | 'GEMINI_VISION'; mathpix?: MathpixReading }
  | { coverage: 'NO_READING' };

const DISPLAY_FENCE = /^\s*(?:\$\$|\\\[)\s*$/;
const DISPLAY_FENCE_END = /^\s*(?:\$\$|\\\])\s*$/;

/**
 * Turns page-level Mathpix Markdown into the line-granular blocks the
 * assembler expects: one block per non-empty line, with fenced display math
 * ($$ ... $$ or \[ ... \]) kept together as a single equation block.
 */
export function markdownToBlocks(markdown: string): OcrBlock[] {
  const blocks: OcrBlock[] = [];
  const lines = markdown.replace(/\r/g, '').split('\n');
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (!line.trim()) continue;
    if (DISPLAY_FENCE.test(line)) {
      const body: string[] = [];
      let cursor = index + 1;
      while (cursor < lines.length && !DISPLAY_FENCE_END.test(lines[cursor])) body.push(lines[cursor++]);
      blocks.push({ type: 'equation', content: body.join(' ').trim() });
      index = cursor;
      continue;
    }
    const inlineDisplay = /^\s*(?:\$\$|\\\[)(.+)(?:\$\$|\\\])\s*$/.exec(line);
    if (inlineDisplay) {
      blocks.push({ type: 'equation', content: inlineDisplay[1].trim() });
    } else if (/^#{1,6}\s/.test(line)) {
      blocks.push({ type: 'title', content: line.replace(/^#{1,6}\s*/, '').trim() });
    } else {
      blocks.push({ type: 'text', content: line.trim() });
    }
  }
  return blocks;
}

export function selectReadings(evidence: PageEvidence): ReadingSelection {
  const mathpixBenchmark = evidence.benchmarks.find((item) => item.provider === 'MATHPIX_OCR');
  const geminiBenchmark = evidence.benchmarks.find((item) => item.provider === 'GEMINI_VISION');

  let mathpix: MathpixReading | undefined;
  const benchmarkBlocks = mathpixBenchmark ? mathpixLinesToBlocks(mathpixBenchmark.rawOutput) : [];
  if (benchmarkBlocks.length > 0) {
    mathpix = { origin: 'BENCHMARK', blocks: benchmarkBlocks };
  } else if (evidence.extraction?.provider === 'MATHPIX_OCR' && evidence.extraction.rawMarkdown?.trim()) {
    mathpix = { origin: 'EXTRACTION', blocks: markdownToBlocks(evidence.extraction.rawMarkdown) };
  }

  const gemini = geminiBenchmark?.structuredData as GeminiPage | undefined;
  const geminiCandidates = gemini ? geminiCandidateLines(gemini) : [];
  const hasGemini = Boolean(gemini);

  if (mathpix && hasGemini) return { coverage: 'READY', mathpix, gemini: gemini!, candidates: geminiCandidates };
  if (mathpix) return { coverage: 'SINGLE_READING', has: 'MATHPIX_OCR', mathpix };
  if (gemini) return { coverage: 'SINGLE_READING', has: 'GEMINI_VISION' };
  return { coverage: 'NO_READING' };
}
