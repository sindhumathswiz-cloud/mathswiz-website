import type { DiagramRegion, OcrTextLine } from './diagram-regions';

/**
 * Attaches each detected figure region on ONE page image to the structured
 * question it visually belongs to, by vertical position.
 *
 * Root cause this addresses: Mathpix's `line_data` gives figure bounding
 * boxes but nothing tying a box to a specific question, so the extraction
 * route only ever attached a page's figures when the page resolved to
 * exactly one question. On a multi-question page (common in area-under-curve
 * / coordinate-geometry chapters, where nearly every question has its own
 * graph) every figure was dropped.
 *
 * How it places them:
 *  - Each question is anchored to the top-Y of the OCR text line where it
 *    starts — matched first by its printed serial number ("3." at line
 *    start), then by a prefix of its stem text.
 *  - Anchored questions are ordered top-to-bottom. Question i "owns" the
 *    vertical band from its own anchor down to the next question's anchor;
 *    the last question owns everything below its anchor.
 *  - A figure whose TOP edge falls in question i's band is attached to i.
 *  - A figure sitting entirely ABOVE the first anchored question is dropped:
 *    on a page that opens mid-solution, that figure belongs to a question
 *    carried over from the previous page, which this call can't see. Better
 *    no image than the wrong one.
 *
 * Returns a Map from question index (into `questions`) to the regions to
 * attach. A question with no anchor, and a figure that can't be placed, are
 * simply absent — the caller falls back to "no image", never a guess.
 */

export interface FigureMatchQuestion {
  /** The book's printed serial for this question, if any ("3", "Q.5", "12(a)"). */
  printedNumber?: string | null;
  /** The question stem text, as extracted (may contain LaTeX / markdown). */
  content: string;
}

// Normalise a scrap of question / OCR text to bare lowercase words, so a
// stem prefix can be found inside an OCR line despite LaTeX, punctuation and
// spacing differences.
function normalizeWords(s: string): string {
  return s
    .replace(/\$[^$]*\$/g, ' ') // drop inline math
    .replace(/\\[a-zA-Z]+/g, ' ') // drop LaTeX commands
    .replace(/[^a-zA-Z0-9]+/g, ' ')
    .trim()
    .toLowerCase();
}

// A line that STARTS with this question's printed number, e.g. "3.", "3 )",
// "(3)". Deliberately anchored to the start of the line — a bare "3"
// appearing mid-sentence is not a question opener.
function numberOpenerRegex(printedNumber: string): RegExp | null {
  const n = printedNumber.trim().replace(/[.)]+$/, '');
  if (!n) return null;
  const escaped = n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`^\\(?\\s*${escaped}\\s*[.)]`);
}

function anchorForQuestion(question: FigureMatchQuestion, lines: OcrTextLine[]): number | null {
  const prefix = normalizeWords(question.content).split(' ').filter(Boolean).slice(0, 6).join(' ');

  // 1) A line that opens with this question's printed number. If several
  //    lines do (numbering can repeat within a page's solutions), prefer one
  //    whose text also shares the stem prefix; else the topmost.
  const opener = question.printedNumber ? numberOpenerRegex(question.printedNumber) : null;
  if (opener) {
    const hits = lines.filter((l) => opener.test(l.text));
    if (hits.length === 1) return hits[0].top;
    if (hits.length > 1) {
      const withPrefix = prefix
        ? hits.find((l) => normalizeWords(l.text).includes(prefix.split(' ').slice(0, 3).join(' ')))
        : undefined;
      return (withPrefix ?? hits[0]).top;
    }
  }

  // 2) Fall back to the first line containing the stem's opening words.
  if (prefix) {
    const shortPrefix = prefix.split(' ').slice(0, 4).join(' ');
    const hit = lines.find((l) => normalizeWords(l.text).includes(shortPrefix));
    if (hit) return hit.top;
  }

  return null;
}

export function matchFiguresToQuestions(
  regions: DiagramRegion[],
  textLines: OcrTextLine[],
  questions: FigureMatchQuestion[],
): Map<number, DiagramRegion[]> {
  const result = new Map<number, DiagramRegion[]>();
  const lines = Array.isArray(textLines) ? textLines : [];
  if (regions.length === 0 || questions.length === 0) return result;

  // Only one question on the page — every figure is unambiguously its own.
  if (questions.length === 1) {
    result.set(0, [...regions]);
    return result;
  }

  const anchored = questions
    .map((question, index) => ({ index, top: anchorForQuestion(question, lines) }))
    .filter((a): a is { index: number; top: number } => a.top != null)
    .sort((a, b) => a.top - b.top);

  if (anchored.length === 0) return result;

  for (const region of regions) {
    // The owner is the last question whose anchor is at or above this
    // figure's top edge. A small upward tolerance (half a typical line) lets
    // a figure that OCR placed a hair above its question's first text line
    // still land on that question rather than being dropped.
    const TOLERANCE_PX = 12;
    let ownerIndex: number | null = null;
    for (const a of anchored) {
      if (a.top <= region.y + TOLERANCE_PX) ownerIndex = a.index;
      else break;
    }
    if (ownerIndex == null) continue; // figure above the first question — not ours to place

    const list = result.get(ownerIndex);
    if (list) list.push(region);
    else result.set(ownerIndex, [region]);
  }

  return result;
}
