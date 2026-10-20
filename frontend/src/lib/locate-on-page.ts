import { compactForMatch, gramsOf } from '@/lib/question-match';
import type { TextLayerLine } from '@/lib/page-text-layer';

/**
 * Finds where a question starts on its page, from the page's text layer. A stored question carries only a page
 * number, so the reader looks for the line whose words best match the opening of the question text and
 * highlights from there. The match is a hint for the eye, never used to change any data.
 */

export interface PageLocation {
  /** Index of the line in the page's text layer. */
  line: number;
  /** Position of the line, as fractions of the page (0 to 1). */
  y: number;
  height: number;
  /** 0 to 1: how much of the line's text is found in the question's opening. */
  score: number;
}

const HEAD_CHARS = 120;
const MIN_LINE_CHARS = 8;
const MIN_SCORE = 0.55;

/** The opening of the question, stripped of tags and numbering. */
const headOf = (content: string) => compactForMatch(content).slice(0, HEAD_CHARS);

/**
 * The best line for a question's opening, or null when nothing on the page resembles it. When several lines
 * match equally well the highest one wins, since a question starts above its own working.
 */
export function locateOnPage(lines: Array<Pick<TextLayerLine, 'y' | 'h' | 'text'>>, questionContent: string): PageLocation | null {
  const head = headOf(questionContent);
  if (head.length < MIN_LINE_CHARS) return null;
  const headGrams = gramsOf(head);
  let best: PageLocation | null = null;
  lines.forEach((line, index) => {
    const compact = compactForMatch(line.text);
    // A short line cannot say much, and a line longer than the whole head is matched on its start only.
    if (compact.length < MIN_LINE_CHARS) return;
    const grams = gramsOf(compact.slice(0, HEAD_CHARS));
    if (grams.size === 0) return;
    let shared = 0;
    for (const gram of grams) if (headGrams.has(gram)) shared++;
    const score = shared / grams.size;
    if (score < MIN_SCORE) return;
    if (!best || score > best.score + 0.02 || (Math.abs(score - best.score) <= 0.02 && line.y < best.y)) best = { line: index, y: line.y, height: line.h, score };
  });
  return best;
}
