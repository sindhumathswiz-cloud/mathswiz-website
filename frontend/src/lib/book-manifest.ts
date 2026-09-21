import prisma from './prisma';
import { canonicalChapters, snapToChapter } from './chapter-classifier';

/**
 * Chapter-manifest detection + the shared page-text signals it needs.
 *
 * A book chapter holds several question-type SECTIONS, each with its own page
 * range, and each section's answers are arranged differently: printed inline
 * with the questions (worked examples), in a separate letter-key block pages
 * later, in a separate "Detailed Solutions" block, or absent entirely (a
 * practice exercise). `detectManifest` proposes this whole structure from the
 * OCR'd page text so an admin can confirm/edit it before extraction runs.
 *
 * The answer-key / detailed-solutions page signals below were previously
 * duplicated inside match-answer-keys/route.ts and
 * match-detailed-solutions/route.ts. They live here now so detection and
 * matching agree on what an answer-key or solutions page looks like — those
 * routes import these instead of redefining them.
 */

// ---------------------------------------------------------------------------
// Answer-key page signal (moved verbatim from match-answer-keys/route.ts)
// ---------------------------------------------------------------------------

// A printed number immediately followed by a bare option letter, optionally
// parenthesized/punctuated -- "1. (b)", "12) c", "3.d" -- and NOT followed by
// more letters (which would mean it's the start of ordinary question text).
export const ANSWER_PAIR_RE = /(?:^|[\s,;])(\d{1,3})\s*[.):]\s*\(?([A-Da-d])\)?(?=[\s,.;]|$)/g;
export const ANSWER_HEADING_RE = /\banswers?\b|\banswer\s*key\b/i;

const MIN_PAIRS_WITH_HEADING = 3;
const MIN_PAIRS_WITHOUT_HEADING = 8;

export interface AnswerPair {
  number: string;
  letter: string;
}

export function findAnswerKeyPairs(rawText: string): AnswerPair[] {
  const pairs: AnswerPair[] = [];
  const seen = new Set<string>();
  const re = new RegExp(ANSWER_PAIR_RE);
  let match: RegExpExecArray | null;
  while ((match = re.exec(rawText))) {
    const number = match[1];
    // Keep only the first occurrence of a given number on this page.
    if (seen.has(number)) continue;
    seen.add(number);
    pairs.push({ number, letter: match[2].toUpperCase() });
  }
  return pairs;
}

export function isLikelyAnswerKeyPage(rawText: string, pairs: AnswerPair[] = findAnswerKeyPairs(rawText)): boolean {
  if (pairs.length === 0) return false;
  if (ANSWER_HEADING_RE.test(rawText) && pairs.length >= MIN_PAIRS_WITH_HEADING) return true;
  return pairs.length >= MIN_PAIRS_WITHOUT_HEADING;
}

// ---------------------------------------------------------------------------
// Detailed-solutions page signal (moved verbatim from match-detailed-solutions/route.ts)
// ---------------------------------------------------------------------------

// Requires the page's FIRST LINE to itself be a heading like "Solutions" or
// "Detailed Solutions of ...". Anchoring to the start (not "appears near the
// top") keeps an ordinary question page -- which can contain the word
// "solution" inside a question stem -- from matching.
export const SOLUTIONS_HEADING_RE = /^(?:detailed\s+)?(?:solutions?|hints?)\b.{0,80}$/i;

const MIN_BLOCKS = 2;
const MIN_AVG_BLOCK_CHARS = 40;

export interface SolutionBlock {
  number: string;
  text: string;
}

// A block boundary is a printed number + "." or ")" + whitespace, preceded by
// the page start, a real line break, OR a closing "$" (end of the previous
// solution's LaTeX -- Mathpix frequently runs "...$2. We have,$..." together
// with no newline). The lookbehind doesn't consume the "$", so it stays with
// the PREVIOUS block's text.
export function parseSolutionBlocks(rawText: string): SolutionBlock[] {
  const startRe = /(?<=^|\n|\$)[ \t]*(\d{1,3})[.)][ \t]+/g;
  const starts: Array<{ index: number; number: string; contentStart: number }> = [];
  let m: RegExpExecArray | null;
  while ((m = startRe.exec(rawText))) {
    starts.push({ index: m.index, number: m[1], contentStart: m.index + m[0].length });
  }
  const blocks: SolutionBlock[] = [];
  for (let i = 0; i < starts.length; i++) {
    const end = i + 1 < starts.length ? starts[i + 1].index : rawText.length;
    const text = rawText.slice(starts[i].contentStart, end).trim();
    if (text) blocks.push({ number: starts[i].number, text });
  }
  return blocks;
}

export function isLikelyDetailedSolutionsPage(rawText: string, blocks: SolutionBlock[] = parseSolutionBlocks(rawText)): boolean {
  if (blocks.length < MIN_BLOCKS) return false;
  const firstLine = rawText.trimStart().split('\n', 1)[0].trim();
  if (!SOLUTIONS_HEADING_RE.test(firstLine)) return false;
  const avgLen = blocks.reduce((sum, b) => sum + b.text.length, 0) / blocks.length;
  return avgLen >= MIN_AVG_BLOCK_CHARS;
}

// ---------------------------------------------------------------------------
// Manifest types
// ---------------------------------------------------------------------------

export type AnswerKeyCoverage = 'ALL' | 'SELECTED';
export type SolutionCoverage = 'ALL' | 'SELECTED' | 'HINTS';

export interface ManifestSection {
  sectionType: string | null;
  title: string | null;
  code: string | null;
  startPage: number;
  endPage: number;
  inlineAnswers: boolean;
  noAnswers: boolean;
  answerKeyStartPage: number | null;
  answerKeyEndPage: number | null;
  answerKeyCoverage: AnswerKeyCoverage | null;
  solutionsStartPage: number | null;
  solutionsEndPage: number | null;
  solutionCoverage: SolutionCoverage | null;
}

export interface ManifestChapter {
  chapterNumber: string | null;
  name: string;
  startPage: number;
  endPage: number;
  // The book's own printed page numbers (from the table of contents). PDF
  // startPage/endPage = printed + the detected page offset.
  printedStartPage: number | null;
  printedEndPage: number | null;
  sections: ManifestSection[];
}

export interface ProposedManifest {
  chapters: ManifestChapter[];
  /** PDF pageNumber - book-printed pageNumber, from the TOC + chapter openers. */
  pageOffset: number;
  /** True when a table of contents was found and used to place chapters. */
  tocFound: boolean;
}

export interface ManifestDetectPage {
  pageNumber: number;
  rawText: string | null;
  layoutData?: unknown;
}

export interface TocEntry {
  number: string | null;
  name: string;
  printedPage: number;
}

export interface ParsedToc {
  entries: TocEntry[];
  /** Book-printed page where PART-B (sample papers etc.) starts, if any. */
  partBPrintedPage: number | null;
}

// Chapter-level running header / opener detection.
const CHAPTER_MARKER_RE = /^\s*(?:CHAPTER|UNIT)\s+([IVXLC]+|\d{1,2})\b[\s:.–—-]*(.*)$/i;

// Question-type section headings, most specific first. `EXERCISE` last so a
// more descriptive heading on the same page wins. `THEORY` marks non-question
// sections (formula lists, basic concepts) so they aren't offered as question
// sections.
const SECTION_PATTERNS: Array<{ re: RegExp; type: string }> = [
  { re: /\blist\s+of\s+important\s+formulae\b|\bbasic\s+(?:concepts?|pts)\b|\bbasic\s+points\b/i, type: 'THEORY' },
  { re: /\bsolved\s+examples?\b/i, type: 'SOLVED_EXAMPLES' },
  { re: /\bselected\s+ncert\s+questions?\b/i, type: 'NCERT_SELECTED' },
  { re: /\bmultiple\s+choice\s+questions?\b|\bMCQ['’]?s?\b/i, type: 'MCQ' },
  { re: /\bassertion[\s-]*(?:and\s+)?reason(?:ing)?\b/i, type: 'ASSERTION_REASON' },
  { re: /\bcase[\s-]*(?:based|study)\b|\bsource[\s-]*based\b|\bdata[\s-]*based\b/i, type: 'CASE_STUDY' },
  { re: /\bself[\s-]*assessment\b/i, type: 'SELF_ASSESSMENT' },
  { re: /\bvery\s+short\s+answer\b/i, type: 'VERY_SHORT_ANSWER' },
  { re: /\bshort\s+answer\b/i, type: 'SHORT_ANSWER' },
  { re: /\blong\s+answer\b/i, type: 'LONG_ANSWER' },
  { re: /\bfill\s+in\s+the\s+blanks?\b/i, type: 'FILL_IN_BLANKS' },
  { re: /\btrue\s*(?:\/|or)\s*false\b/i, type: 'TRUE_FALSE' },
  { re: /\bobjective\s+type\b/i, type: 'OBJECTIVE' },
  { re: /\bexercise\b[\s.]*([0-9]+[0-9a-z.]*)?/i, type: 'EXERCISE' },
];

const NON_QUESTION_SECTION_TYPES = new Set(['THEORY']);

// A TOC row, two shapes:
//  1. The Mathpix markdown-table shape from an OCR'd page ("\hline 10.
//     Vector Algebra & 329 \\") -- requires the "&" column separator.
//  2. A plain native-PDF-text list from a DIGITAL_MATH book with no OCR
//     involved at all ("10. Binomial Theorem 350") -- number, dot, name,
//     trailing printed page, whitespace-separated, no table markup.
const TOC_ROW_TABLE_RE = /^(?:\\hline\s*)?(\d{1,2})\.\s+(.+?)\s*&\s*(\d{1,4})\s*\\{0,2}\s*$/;
const TOC_ROW_PLAIN_RE = /^(\d{1,3})\.\s+(.+?)\s+(\d{1,4})\s*$/;
const PART_B_RE = /\bPART[\s-]*B\b|\\multicolumn/i;
const TOC_PAGE_RE = /\bcontents\b/i;

function matchTocRow(line: string): { number: string; name: string; printedPage: number } | null {
  const m = line.match(TOC_ROW_TABLE_RE) || line.match(TOC_ROW_PLAIN_RE);
  if (!m) return null;
  return { number: m[1], name: m[2].replace(/\s+/g, ' ').trim(), printedPage: Number(m[3]) };
}

// How many further pages a TOC is allowed to spread across -- a long chapter
// list in plain native-text form (one row per line, no dense table) needs
// more vertical space than the same list packed into a Mathpix markdown
// table, so it commonly spills onto a second (or third) printed page.
const MAX_TOC_PAGES = 4;

/**
 * Find the table of contents and read the chapter list + printed start pages
 * from it. Returns empty entries when no TOC-shaped page is found in the first
 * ~15 pages. The TOC itself may span several PHYSICALLY CONSECUTIVE pages
 * (pageNumber N, N+1, ... -- never a jump elsewhere in the book) starting
 * from the one containing the literal "Contents" heading.
 */
export function parseTableOfContents(pages: ManifestDetectPage[]): ParsedToc {
  const sorted = [...pages].sort((a, b) => a.pageNumber - b.pageNumber);
  const head = sorted.slice(0, 15);
  for (const page of head) {
    const text = page.rawText || '';
    if (!TOC_PAGE_RE.test(text)) continue;
    const startIndex = sorted.indexOf(page);

    const entries: TocEntry[] = [];
    let partBPrintedPage: number | null = null;
    let hitPartB = false;
    for (let j = startIndex; j < sorted.length && j < startIndex + MAX_TOC_PAGES; j++) {
      if (j > startIndex && sorted[j].pageNumber !== sorted[j - 1].pageNumber + 1) break;
      const lines = (sorted[j].rawText || '').split('\n');
      const entriesBefore = entries.length;
      for (const raw of lines) {
        const line = raw.trim();
        if (PART_B_RE.test(line)) {
          hitPartB = true;
          const m = line.match(/&\s*(\d{1,4})/);
          if (m && partBPrintedPage === null) partBPrintedPage = Number(m[1]);
          continue;
        }
        if (hitPartB) {
          // After PART-B, the first row with a "& page" number is where it starts.
          if (partBPrintedPage === null) {
            const m = line.match(/&\s*(\d{1,4})/);
            if (m) partBPrintedPage = Number(m[1]);
          }
          continue;
        }
        const row = matchTocRow(line);
        if (!row) continue;
        // Numbers should ascend; a reset means we've left the chapter list.
        if (entries.length && Number(row.number) <= Number(entries[entries.length - 1].number)) continue;
        entries.push(row);
      }
      // A continuation page (j > startIndex) that added nothing means the
      // chapter list ended on the previous page -- don't keep scanning
      // unrelated later pages just because they're physically consecutive.
      if (j > startIndex && entries.length === entriesBefore) break;
      if (hitPartB) break;
    }
    if (entries.length >= 3) return { entries, partBPrintedPage };
  }
  return { entries: [], partBPrintedPage: null };
}

/**
 * For each TOC entry, the PDF page where its chapter actually opens (name near
 * the top, often followed by "basic pts" / "BASIC CONCEPTS"). Keyed by the
 * entry's printed page.
 */
export function findChapterOpeners(pages: ManifestDetectPage[], entries: TocEntry[], className?: string): Map<number, number> {
  const byPage = new Map(pages.map((p) => [p.pageNumber, p.rawText || '']));
  const openers = new Map<number, number>();
  for (const entry of entries) {
    const target = normalizeName(entry.name);
    const snapped = snapToChapter(entry.name, className);
    for (let pdf = entry.printedPage - 1; pdf <= entry.printedPage + 14; pdf++) {
      const text = byPage.get(pdf);
      if (!text) continue;
      const first = nonEmptyLines(text).slice(0, 2).map(normalizeName).join(' ');
      const matches = first.includes(target)
        || (snapped && first.includes(normalizeName(snapped)))
        || (target.length > 8 && first.includes(target.slice(0, Math.ceil(target.length * 0.7))));
      if (matches) {
        openers.set(entry.printedPage, pdf);
        break;
      }
    }
  }
  return openers;
}

/** PDF pageNumber - book-printed pageNumber, as the modal per-chapter offset. */
export function estimatePageOffset(pages: ManifestDetectPage[], entries: TocEntry[], className?: string): number {
  const openers = findChapterOpeners(pages, entries, className);
  const counts = new Map<number, number>();
  for (const [printed, pdf] of openers) {
    const offset = pdf - printed;
    counts.set(offset, (counts.get(offset) ?? 0) + 1);
  }
  let best = 0;
  let bestCount = 0;
  for (const [offset, count] of counts) {
    if (count > bestCount) { best = offset; bestCount = count; }
  }
  return best;
}

function normalizeName(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9 ]/g, '').replace(/\s+/g, ' ').trim();
}

// Answers/solutions printed right next to the questions.
const INLINE_ANSWER_RE = /(?:^|\n)\s*(?:Sol\.|Ans\.|Answer\s*[:.]|Solution\s*[:.])/gi;

function nonEmptyLines(rawText: string): string[] {
  return rawText.split('\n').map((line) => line.trim()).filter(Boolean);
}

function pageLayoutType(page: ManifestDetectPage): string {
  const layout = page.layoutData && typeof page.layoutData === 'object' && !Array.isArray(page.layoutData)
    ? (page.layoutData as { pageType?: string })
    : {};
  return layout.pageType || '';
}

interface PageSignal {
  pageNumber: number;
  chapter: string | null;
  chapterNumber: string | null;
  isAnswerKey: boolean;
  isSolutions: boolean;
  isFrontMatter: boolean;
  section: { type: string; title: string } | null;
  inlineAnswerHits: number;
  /** First line of an answer-key / solutions page (used to infer coverage). */
  blockHeading: string | null;
}

function analysePage(page: ManifestDetectPage, className?: string): PageSignal {
  const rawText = page.rawText || '';
  const lines = nonEmptyLines(rawText);
  const layoutType = pageLayoutType(page);

  // Chapter: look at the running header (top 3 lines) and footer (bottom 3).
  let chapter: string | null = null;
  let chapterNumber: string | null = null;
  for (const line of [...lines.slice(0, 3), ...lines.slice(-3)]) {
    const marker = line.match(CHAPTER_MARKER_RE);
    if (marker) {
      const fromTitle = snapToChapter(marker[2] || '', className);
      const snapped = fromTitle || snapToChapter(line, className);
      if (snapped) {
        chapter = snapped;
        chapterNumber = marker[1];
        break;
      }
    }
    const snapped = snapToChapter(line, className);
    if (snapped) {
      chapter = chapter || snapped;
    }
  }

  const answerPairs = findAnswerKeyPairs(rawText);
  const isAnswerKey = isLikelyAnswerKeyPage(rawText, answerPairs)
    || layoutType === 'ANSWER_KEY';
  const isSolutions = isLikelyDetailedSolutionsPage(rawText)
    || layoutType === 'SOLUTION';
  const isFrontMatter = layoutType === 'FRONT_OR_DIVIDER' || (lines.length > 0 && lines.length <= 2 && rawText.trim().length < 40);

  // Section heading: a real heading sits at (or very near) the START of one of
  // the first three lines and is short -- not the word "MCQ" buried in a
  // question stem three lines down.
  let section: { type: string; title: string } | null = null;
  for (const line of lines.slice(0, 3)) {
    if (line.length > 70) continue;
    // Tolerate a short label prefix like "(A) " or "1. " before the heading.
    const stripped = line.replace(/^[([]?[A-Za-z0-9]{1,3}[)\].:]?\s+/, '').trim();
    for (const { re, type } of SECTION_PATTERNS) {
      const m = stripped.match(re);
      if (m && m.index === 0) {
        section = { type, title: line.slice(0, 120) };
        break;
      }
    }
    if (section) break;
  }

  const inlineAnswerHits = (rawText.match(INLINE_ANSWER_RE) || []).length;
  const blockHeading = (isAnswerKey || isSolutions) ? (lines[0] ?? null) : null;

  return { pageNumber: page.pageNumber, chapter, chapterNumber, isAnswerKey, isSolutions, isFrontMatter, section, inlineAnswerHits, blockHeading };
}

// Collapse a per-page label array into maximal runs, bridging gaps of up to
// `bridge` pages where the label is null but flanked by the same value.
function runsOf(signals: PageSignal[], label: (s: PageSignal) => string | null, bridge = 2): Array<{ value: string; start: number; end: number }> {
  const filled = signals.map((s) => label(s));
  for (let i = 0; i < filled.length; i++) {
    if (filled[i] !== null) continue;
    // find previous and next non-null
    let prev = i - 1;
    while (prev >= 0 && filled[prev] === null) prev--;
    let next = i + 1;
    while (next < filled.length && filled[next] === null) next++;
    if (prev >= 0 && next < filled.length && filled[prev] === filled[next] && next - prev - 1 <= bridge) {
      filled[i] = filled[prev];
    }
  }
  const runs: Array<{ value: string; start: number; end: number }> = [];
  for (let i = 0; i < filled.length; i++) {
    const value = filled[i];
    if (value === null) continue;
    const last = runs[runs.length - 1];
    if (last && last.value === value && signals[i].pageNumber === last.end + 1) {
      last.end = signals[i].pageNumber;
    } else {
      runs.push({ value, start: signals[i].pageNumber, end: signals[i].pageNumber });
    }
  }
  return runs;
}

// Contiguous runs of pages where `pred` holds, keyed by page number.
function boolRuns(signals: PageSignal[], pred: (s: PageSignal) => boolean): Array<{ start: number; end: number }> {
  const runs: Array<{ start: number; end: number }> = [];
  for (const s of signals) {
    if (!pred(s)) continue;
    const last = runs[runs.length - 1];
    if (last && s.pageNumber === last.end + 1) last.end = s.pageNumber;
    else runs.push({ start: s.pageNumber, end: s.pageNumber });
  }
  return runs;
}

const MIN_CHAPTER_PAGES = 2;

interface ChapterRange {
  name: string;
  chapterNumber: string | null;
  startPage: number;
  endPage: number;
  printedStartPage: number | null;
  printedEndPage: number | null;
}

function coverageFromTitle(title: string | null): { key: AnswerKeyCoverage | null; sol: SolutionCoverage | null } {
  const t = (title || '').toLowerCase();
  const selected = /\bselected\b|\bof\s+selected\b/.test(t);
  const hints = /\bhints?\b/.test(t);
  return {
    key: selected ? 'SELECTED' : null,
    sol: hints ? 'HINTS' : selected ? 'SELECTED' : null,
  };
}

/** Detect the question-type sections that live inside one chapter's page range. */
function sectionsForChapter(
  signals: PageSignal[],
  chapterStart: number,
  chapterEnd: number,
  answerKeyRuns: Array<{ start: number; end: number }>,
  solutionsRuns: Array<{ start: number; end: number }>,
): ManifestSection[] {
  const chapterPages = signals.filter((s) => s.pageNumber >= chapterStart && s.pageNumber <= chapterEnd);
  // Section openers, with consecutive same-type headings collapsed to the first.
  const rawOpeners = chapterPages
    .filter((s) => s.section && !s.isAnswerKey && !s.isSolutions)
    .map((s) => ({ page: s.pageNumber, type: s.section!.type, title: s.section!.title }));
  const openers = rawOpeners.filter((o, i) => i === 0 || o.type !== rawOpeners[i - 1].type);

  const keyRunsHere = answerKeyRuns.filter((r) => r.start >= chapterStart && r.start <= chapterEnd);
  const solRunsHere = solutionsRuns.filter((r) => r.start >= chapterStart && r.start <= chapterEnd);
  const firstBlockPage = Math.min(
    ...keyRunsHere.map((r) => r.start),
    ...solRunsHere.map((r) => r.start),
    chapterEnd + 1,
  );

  let bounds: Array<{ startPage: number; endPage: number; type: string | null; title: string | null }>;
  if (openers.length === 0) {
    bounds = [{ startPage: chapterStart, endPage: Math.max(chapterStart, firstBlockPage - 1), type: null, title: null }];
  } else {
    bounds = openers.map((opener, index) => {
      const nextOpener = openers[index + 1]?.page ?? chapterEnd + 1;
      const blockAfter = Math.min(
        ...keyRunsHere.filter((r) => r.start > opener.page).map((r) => r.start),
        ...solRunsHere.filter((r) => r.start > opener.page).map((r) => r.start),
        chapterEnd + 1,
      );
      const endPage = Math.max(opener.page, Math.min(nextOpener, blockAfter) - 1);
      return { startPage: opener.page, endPage, type: opener.type, title: opener.title };
    });

    // If the only detected headings are non-question (theory / formulae) or a
    // big gap sits between the last section and the chapter's questions/blocks,
    // add a catch-all question section for the remainder.
    const last = bounds[bounds.length - 1];
    const questionsEnd = firstBlockPage - 1;
    const allNonQuestion = bounds.every((b) => b.type != null && NON_QUESTION_SECTION_TYPES.has(b.type));
    if ((allNonQuestion || last.type == null || NON_QUESTION_SECTION_TYPES.has(last.type)) && questionsEnd - last.endPage >= 3) {
      bounds.push({ startPage: last.endPage + 1, endPage: Math.max(last.endPage + 1, questionsEnd), type: null, title: null });
    }
  }

  return bounds.map((bound, index) => {
    const nextStart = bounds[index + 1]?.startPage ?? chapterEnd + 1;
    const isNonQuestion = bound.type != null && NON_QUESTION_SECTION_TYPES.has(bound.type);

    const keyRun = isNonQuestion ? undefined : (
      keyRunsHere.find((r) => r.start > bound.startPage && r.start < nextStart)
      ?? (index === bounds.length - 1 ? keyRunsHere.find((r) => r.start > bound.startPage) : undefined)
    );
    const solRun = isNonQuestion ? undefined : (
      solRunsHere.find((r) => r.start > bound.startPage && r.start < nextStart)
      ?? (index === bounds.length - 1 ? solRunsHere.find((r) => r.start > bound.startPage) : undefined)
    );

    const sectionSignalPages = signals.filter((s) => s.pageNumber >= bound.startPage && s.pageNumber <= bound.endPage);
    const inlineAnswers = !isNonQuestion && (
      bound.type === 'SOLVED_EXAMPLES'
      || (sectionSignalPages.length > 0
        && sectionSignalPages.filter((s) => s.inlineAnswerHits >= 2).length / sectionSignalPages.length >= 0.5)
    );
    const noAnswers = !isNonQuestion && !inlineAnswers && !keyRun && !solRun;

    const keyHeading = keyRun ? signals.find((s) => s.pageNumber === keyRun.start)?.blockHeading ?? null : null;
    const solHeading = solRun ? signals.find((s) => s.pageNumber === solRun.start)?.blockHeading ?? null : null;

    return {
      sectionType: bound.type,
      title: bound.title,
      code: null,
      startPage: bound.startPage,
      endPage: bound.endPage,
      inlineAnswers,
      noAnswers,
      answerKeyStartPage: keyRun?.start ?? null,
      answerKeyEndPage: keyRun?.end ?? null,
      answerKeyCoverage: keyRun ? coverageFromTitle(keyHeading).key : null,
      solutionsStartPage: solRun?.start ?? null,
      solutionsEndPage: solRun?.end ?? null,
      solutionCoverage: solRun ? coverageFromTitle(solHeading).sol : null,
    };
  });
}

export interface DetectManifestOptions {
  tocEntries?: TocEntry[];
  partBPrintedPage?: number | null;
  pageOffset?: number;
}

/**
 * Propose a full chapter manifest from a run's OCR'd page text. Pure; writes
 * nothing.
 *
 * Chapters come from the book's table of contents when one is found (accurate
 * count, names and printed page numbers) + a detected PDF/book page offset.
 * A book with no parseable TOC falls back to running-header grouping. Either
 * way, sections are ONLY ever detected inside a chapter's page range — a
 * section heading never creates a chapter.
 */
export function detectManifest(pages: ManifestDetectPage[], className?: string, options: DetectManifestOptions = {}): ProposedManifest {
  const ordered = [...pages].sort((a, b) => a.pageNumber - b.pageNumber);
  const signals = ordered.map((page) => analysePage(page, className));
  const byPage = new Map(signals.map((s) => [s.pageNumber, s]));
  const maxPage = ordered[ordered.length - 1]?.pageNumber ?? 0;

  const answerKeyRuns = boolRuns(signals, (s) => s.isAnswerKey);
  const solutionsRuns = boolRuns(signals, (s) => s.isSolutions && !s.isAnswerKey);

  // --- chapter ranges ---
  const parsedToc = options.tocEntries
    ? { entries: options.tocEntries, partBPrintedPage: options.partBPrintedPage ?? null }
    : parseTableOfContents(pages);
  const tocFound = parsedToc.entries.length >= 3;

  let pageOffset = 0;
  let chapterRanges: ChapterRange[];

  if (tocFound) {
    const openers = findChapterOpeners(pages, parsedToc.entries, className);
    pageOffset = options.pageOffset ?? estimatePageOffset(pages, parsedToc.entries, className);
    const off = pageOffset;
    // Where each chapter's PDF page sits: its own detected opener when we
    // found one (books drift by a page mid-way), else printed + modal offset.
    const startFor = (entry: TocEntry) => openers.get(entry.printedPage) ?? entry.printedPage + off;
    chapterRanges = parsedToc.entries.map((entry, index) => {
      const next = parsedToc.entries[index + 1];
      const nextPrinted = next?.printedPage ?? parsedToc.partBPrintedPage ?? (maxPage - off) + 1;
      const printedEnd = nextPrinted - 1;
      const startPage = startFor(entry);
      const endPage = next ? Math.max(startPage, startFor(next) - 1) : Math.min(maxPage, printedEnd + off);
      return {
        name: snapToChapter(entry.name, className) ?? entry.name,
        chapterNumber: entry.number,
        printedStartPage: entry.printedPage,
        printedEndPage: printedEnd,
        startPage,
        endPage: Math.min(maxPage, endPage),
      };
    });
  } else {
    // Fallback: running-header runs.
    const known = new Set(canonicalChapters(className));
    const runs = runsOf(signals, (s) => (s.chapter && known.has(s.chapter) ? s.chapter : null))
      .filter((run) => run.end - run.start + 1 >= MIN_CHAPTER_PAGES);
    for (let i = 0; i < runs.length; i++) {
      const nextStart = runs[i + 1]?.start ?? Number.MAX_SAFE_INTEGER;
      let end = runs[i].end;
      let blanks = 0;
      for (let p = end + 1; p < nextStart; p++) {
        const sig = byPage.get(p);
        if (!sig) break;
        if (sig.isAnswerKey || sig.isSolutions || (sig.chapter === runs[i].value && !sig.isFrontMatter)) { end = p; blanks = 0; }
        else if (sig.isFrontMatter && blanks < 2) blanks++;
        else break;
      }
      runs[i].end = end;
    }
    chapterRanges = runs.map((run) => {
      const chapterNumber = signals.find((s) => s.pageNumber >= run.start && s.pageNumber <= run.end && s.chapterNumber)?.chapterNumber ?? null;
      return { name: run.value, chapterNumber, startPage: run.start, endPage: run.end, printedStartPage: null, printedEndPage: null };
    });
  }

  const chapters: ManifestChapter[] = chapterRanges.map((range) => ({
    chapterNumber: range.chapterNumber,
    name: range.name,
    startPage: range.startPage,
    endPage: range.endPage,
    printedStartPage: range.printedStartPage,
    printedEndPage: range.printedEndPage,
    sections: sectionsForChapter(signals, range.startPage, range.endPage, answerKeyRuns, solutionsRuns),
  }));

  return { chapters, pageOffset, tocFound };
}

// ---------------------------------------------------------------------------
// Consumer helpers — used by extract-questions / match-answer-keys /
// match-detailed-solutions to prefer a confirmed manifest over their heuristics.
// ---------------------------------------------------------------------------

// Section types that hold theory / formulae, not questions — never a question
// region for extraction or matching.
export const NON_QUESTION_SECTIONS = NON_QUESTION_SECTION_TYPES;

export interface ConfirmedSection {
  id: string;
  code: string | null;
  title: string | null;
  sectionType: string | null;
  startPage: number | null;
  endPage: number | null;
  inlineAnswers: boolean;
  noAnswers: boolean;
  answerKeyStartPage: number | null;
  answerKeyEndPage: number | null;
  answerKeyCoverage: string | null;
  solutionsStartPage: number | null;
  solutionsEndPage: number | null;
  solutionCoverage: string | null;
  // Reconciliation (lib/exercise-reconciliation.ts) -- expectedQuestionCount
  // is admin-entered; the other three plus reconciledAt are only ever
  // written by that module, never by the extraction pipeline itself.
  expectedQuestionCount: number | null;
  extractedQuestionCount: number;
  matchedQuestionCount: number;
  unresolvedQuestionCount: number;
  reconciledAt: Date | null;
}

export interface ConfirmedChapter {
  id: string;
  name: string;
  topic: string | null;
  startPage: number | null;
  endPage: number | null;
  manifestConfirmedAt: Date | string | null;
  exercises: ConfirmedSection[];
}

const inRange = (page: number, start: number | null | undefined, end: number | null | undefined): boolean =>
  start != null && end != null && page >= start && page <= end;

/**
 * Load every confirmed chapter for a book (manifest confirmed + both page
 * bounds set), with its sections. Returns [] when no manifest has been
 * confirmed — callers then fall back to their existing heuristics.
 */
export async function loadConfirmedChapters(bookId: string): Promise<ConfirmedChapter[]> {
  const chapters = await prisma.bookChapter.findMany({
    where: {
      bookId,
      manifestConfirmedAt: { not: null },
      startPage: { not: null },
      endPage: { not: null },
    },
    orderBy: { orderIndex: 'asc' },
    select: {
      id: true,
      name: true,
      topic: true,
      startPage: true,
      endPage: true,
      manifestConfirmedAt: true,
      exercises: {
        orderBy: { orderIndex: 'asc' },
        select: {
          id: true,
          code: true,
          title: true,
          sectionType: true,
          startPage: true,
          endPage: true,
          inlineAnswers: true,
          noAnswers: true,
          answerKeyStartPage: true,
          answerKeyEndPage: true,
          answerKeyCoverage: true,
          solutionsStartPage: true,
          solutionsEndPage: true,
          solutionCoverage: true,
          expectedQuestionCount: true,
          extractedQuestionCount: true,
          matchedQuestionCount: true,
          unresolvedQuestionCount: true,
          reconciledAt: true,
        },
      },
    },
  });
  return chapters;
}

/** The confirmed chapter whose page range contains `page`, if any. */
export function chapterForPage(chapters: ConfirmedChapter[], page: number): ConfirmedChapter | null {
  return chapters.find((c) => c.manifestConfirmedAt && inRange(page, c.startPage, c.endPage)) ?? null;
}

/**
 * True when `page` falls inside ANY confirmed chapter's range. Used by the
 * answer-key/solutions matching heuristic fallback: if the key/solutions page
 * itself matched no confirmed chapter, a heuristic-window candidate that DOES
 * belong to some other confirmed chapter is a cross-chapter false positive --
 * that chapter's own admin never vouched for this page, so the candidate
 * should be excluded rather than matched on printed-number proximity alone.
 */
export function inAnyConfirmedChapter(chapters: ConfirmedChapter[], page: number): boolean {
  return chapterForPage(chapters, page) != null;
}

/**
 * Distinct numeric literals (integers or decimals) in `text`, excluding
 * `exclude` (typically the printed question number itself, which isn't
 * independent content evidence -- it's the join key being verified).
 */
export function extractSalientNumbers(text: string, exclude?: string): Set<string> {
  const matches = text.match(/\d+(?:\.\d+)?/g) ?? [];
  return new Set(exclude ? matches.filter((n) => n !== exclude) : matches);
}

export interface ContentAgreement {
  /** False when the question has no numbers of its own to compare -- content
   *  agreement is inconclusive (not evidence either way), not a red flag. */
  applicable: boolean;
  /** Count of numeric literals shared between the question and the block. */
  score: number;
}

/**
 * How well a candidate question's own content numerically agrees with a
 * solution/answer block's text, independent of the printed-number match that
 * already selected this as a candidate. A subjective/long-answer question
 * with real numbers in its statement should see at least some of them
 * reappear in its own worked solution; zero overlap (when the question DOES
 * have numbers to check) is a sign this block may actually belong to a
 * different question that merely shares a printed number in the lookback
 * window.
 */
export function contentAgreementScore(questionContent: string, blockText: string, printedNumber: string): ContentAgreement {
  const qNums = extractSalientNumbers(questionContent, printedNumber);
  if (qNums.size === 0) return { applicable: false, score: 0 };
  const bNums = extractSalientNumbers(blockText, printedNumber);
  let score = 0;
  for (const n of qNums) if (bNums.has(n)) score++;
  return { applicable: true, score };
}

/**
 * The confirmed QUESTION section whose page range contains `page`, if any.
 * Theory / formula sections are not question regions.
 */
export function sectionForPage(chapters: ConfirmedChapter[], page: number): { chapter: ConfirmedChapter; section: ConfirmedSection } | null {
  for (const chapter of chapters) {
    if (!chapter.manifestConfirmedAt) continue;
    for (const section of chapter.exercises) {
      if (section.sectionType && NON_QUESTION_SECTION_TYPES.has(section.sectionType)) continue;
      if (inRange(page, section.startPage, section.endPage)) return { chapter, section };
    }
  }
  return null;
}

/** The confirmed section whose ANSWER-KEY page range contains `page`, if any. */
export function answerKeySectionForPage(chapters: ConfirmedChapter[], page: number): { chapter: ConfirmedChapter; section: ConfirmedSection } | null {
  for (const chapter of chapters) {
    if (!chapter.manifestConfirmedAt) continue;
    for (const section of chapter.exercises) {
      if (section.noAnswers) continue;
      if (inRange(page, section.answerKeyStartPage, section.answerKeyEndPage)) return { chapter, section };
    }
  }
  return null;
}

/** The confirmed section whose DETAILED-SOLUTIONS page range contains `page`, if any. */
export function solutionsSectionForPage(chapters: ConfirmedChapter[], page: number): { chapter: ConfirmedChapter; section: ConfirmedSection } | null {
  for (const chapter of chapters) {
    if (!chapter.manifestConfirmedAt) continue;
    for (const section of chapter.exercises) {
      if (section.noAnswers) continue;
      if (inRange(page, section.solutionsStartPage, section.solutionsEndPage)) return { chapter, section };
    }
  }
  return null;
}
