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
  solutionsStartPage: number | null;
  solutionsEndPage: number | null;
}

export interface ManifestChapter {
  chapterNumber: string | null;
  name: string;
  startPage: number;
  endPage: number;
  sections: ManifestSection[];
}

export interface ProposedManifest {
  chapters: ManifestChapter[];
}

export interface ManifestDetectPage {
  pageNumber: number;
  rawText: string | null;
  layoutData?: unknown;
}

// Chapter-level running header / opener detection.
const CHAPTER_MARKER_RE = /^\s*(?:CHAPTER|UNIT)\s+([IVXLC]+|\d{1,2})\b[\s:.–—-]*(.*)$/i;

// Question-type section headings, most specific first. `EXERCISE` last so a
// more descriptive heading on the same page wins.
const SECTION_PATTERNS: Array<{ re: RegExp; type: string }> = [
  { re: /\bsolved\s+examples?\b/i, type: 'SOLVED_EXAMPLES' },
  { re: /\bmultiple\s+choice\s+questions?\b|\bMCQ['’]?s?\b/i, type: 'MCQ' },
  { re: /\bassertion[\s-]*(?:and\s+)?reason(?:ing)?\b/i, type: 'ASSERTION_REASON' },
  { re: /\bcase[\s-]*(?:based|study)\b|\bsource[\s-]*based\b/i, type: 'CASE_STUDY' },
  { re: /\bvery\s+short\s+answer\b/i, type: 'VERY_SHORT_ANSWER' },
  { re: /\bshort\s+answer\b/i, type: 'SHORT_ANSWER' },
  { re: /\blong\s+answer\b/i, type: 'LONG_ANSWER' },
  { re: /\bfill\s+in\s+the\s+blanks?\b/i, type: 'FILL_IN_BLANKS' },
  { re: /\btrue\s*(?:\/|or)\s*false\b/i, type: 'TRUE_FALSE' },
  { re: /\bobjective\s+type\b/i, type: 'OBJECTIVE' },
  { re: /\bexercise\b[\s.]*([0-9]+[0-9a-z.]*)?/i, type: 'EXERCISE' },
];

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

  return { pageNumber: page.pageNumber, chapter, chapterNumber, isAnswerKey, isSolutions, isFrontMatter, section, inlineAnswerHits };
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

/**
 * Propose a full chapter manifest from a run's OCR'd page text. Pure; writes
 * nothing. The result is a starting point for an admin to confirm/edit — every
 * range is a best guess from running headers and section headings.
 */
export function detectManifest(pages: ManifestDetectPage[], className?: string): ProposedManifest {
  const ordered = [...pages].sort((a, b) => a.pageNumber - b.pageNumber);
  const signals = ordered.map((page) => analysePage(page, className));
  const byPage = new Map(signals.map((s) => [s.pageNumber, s]));

  const known = new Set(canonicalChapters(className));

  const chapterRuns = runsOf(signals, (s) => (s.chapter && known.has(s.chapter) ? s.chapter : null))
    .filter((run) => run.end - run.start + 1 >= MIN_CHAPTER_PAGES);

  const answerKeyRuns = boolRuns(signals, (s) => s.isAnswerKey);
  const solutionsRuns = boolRuns(signals, (s) => s.isSolutions && !s.isAnswerKey);

  // A chapter's trailing answer-key / detailed-solutions pages often carry no
  // running header (the heading stands alone), so the header-based run stops
  // short of them. Extend each chapter's end forward to cover any answer-key /
  // solutions pages that follow it (tolerating a blank page or two between
  // blocks), stopping before the next chapter and before any real content.
  for (let i = 0; i < chapterRuns.length; i++) {
    const nextStart = chapterRuns[i + 1]?.start ?? Number.MAX_SAFE_INTEGER;
    let end = chapterRuns[i].end;
    let blanksSinceExtend = 0;
    for (let p = end + 1; p < nextStart; p++) {
      const sig = byPage.get(p);
      if (!sig) break;
      const isOwnBlock = sig.isAnswerKey || sig.isSolutions
        || (sig.chapter === chapterRuns[i].value && !sig.isFrontMatter);
      if (isOwnBlock) {
        end = p;
        blanksSinceExtend = 0;
      } else if (sig.isFrontMatter && blanksSinceExtend < 2) {
        blanksSinceExtend++;
      } else {
        break;
      }
    }
    chapterRuns[i].end = end;
  }

  const chapters: ManifestChapter[] = chapterRuns.map((run) => {
    const chapterPages = signals.filter((s) => s.pageNumber >= run.start && s.pageNumber <= run.end);
    const chapterNumber = chapterPages.find((s) => s.chapterNumber)?.chapterNumber ?? null;

    // Section openers: pages inside the chapter with a heading that are NOT
    // themselves an answer-key or solutions page.
    const openers = chapterPages
      .filter((s) => s.section && !s.isAnswerKey && !s.isSolutions)
      .map((s) => ({ page: s.pageNumber, type: s.section!.type, title: s.section!.title }));

    // First answer-key / solutions page inside the chapter bounds a section's
    // question range even when no later section heading follows.
    const firstBlockPage = Math.min(
      ...answerKeyRuns.filter((r) => r.start >= run.start && r.start <= run.end).map((r) => r.start),
      ...solutionsRuns.filter((r) => r.start >= run.start && r.start <= run.end).map((r) => r.start),
      run.end + 1,
    );

    let sectionBounds: Array<{ startPage: number; endPage: number; type: string | null; title: string | null }>;
    if (openers.length === 0) {
      sectionBounds = [{ startPage: run.start, endPage: Math.max(run.start, firstBlockPage - 1), type: null, title: null }];
    } else {
      sectionBounds = openers.map((opener, index) => {
        const nextOpener = openers[index + 1]?.page ?? run.end + 1;
        // The section's question pages stop before the next heading OR the
        // first answer/solutions block after this opener, whichever is first.
        const blockAfter = Math.min(
          ...answerKeyRuns.filter((r) => r.start > opener.page && r.start <= run.end).map((r) => r.start),
          ...solutionsRuns.filter((r) => r.start > opener.page && r.start <= run.end).map((r) => r.start),
          run.end + 1,
        );
        const endPage = Math.max(opener.page, Math.min(nextOpener, blockAfter) - 1);
        return { startPage: opener.page, endPage, type: opener.type, title: opener.title };
      });
    }

    const sections: ManifestSection[] = sectionBounds.map((bound, index) => {
      const nextStart = sectionBounds[index + 1]?.startPage ?? run.end + 1;

      // An answer-key run assigned to this section: the first one starting
      // after the section opens and before the next section opens (a shared
      // chapter-end key lands on the last section — the admin can reassign).
      const keyRun = answerKeyRuns.find((r) => r.start > bound.startPage && r.start < nextStart && r.start <= run.end)
        ?? (index === sectionBounds.length - 1
          ? answerKeyRuns.find((r) => r.start > bound.startPage && r.start <= run.end)
          : undefined);
      const solRun = solutionsRuns.find((r) => r.start > bound.startPage && r.start < nextStart && r.start <= run.end)
        ?? (index === sectionBounds.length - 1
          ? solutionsRuns.find((r) => r.start > bound.startPage && r.start <= run.end)
          : undefined);

      const sectionSignalPages = signals.filter((s) => s.pageNumber >= bound.startPage && s.pageNumber <= bound.endPage);
      const inlineAnswers = bound.type === 'SOLVED_EXAMPLES'
        || (sectionSignalPages.length > 0
          && sectionSignalPages.filter((s) => s.inlineAnswerHits >= 2).length / sectionSignalPages.length >= 0.5);

      const noAnswers = !inlineAnswers && !keyRun && !solRun;

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
        solutionsStartPage: solRun?.start ?? null,
        solutionsEndPage: solRun?.end ?? null,
      };
    });

    return {
      chapterNumber,
      name: run.value,
      startPage: run.start,
      endPage: run.end,
      sections,
    };
  });

  void byPage;
  return { chapters };
}

// ---------------------------------------------------------------------------
// Consumer helpers — used by extract-questions / match-answer-keys /
// match-detailed-solutions to prefer a confirmed manifest over their heuristics.
// ---------------------------------------------------------------------------

export interface ConfirmedSection {
  id: string;
  sectionType: string | null;
  startPage: number | null;
  endPage: number | null;
  inlineAnswers: boolean;
  noAnswers: boolean;
  answerKeyStartPage: number | null;
  answerKeyEndPage: number | null;
  solutionsStartPage: number | null;
  solutionsEndPage: number | null;
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
          sectionType: true,
          startPage: true,
          endPage: true,
          inlineAnswers: true,
          noAnswers: true,
          answerKeyStartPage: true,
          answerKeyEndPage: true,
          solutionsStartPage: true,
          solutionsEndPage: true,
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

/** The confirmed section whose QUESTION page range contains `page`, if any. */
export function sectionForPage(chapters: ConfirmedChapter[], page: number): { chapter: ConfirmedChapter; section: ConfirmedSection } | null {
  for (const chapter of chapters) {
    if (!chapter.manifestConfirmedAt) continue;
    for (const section of chapter.exercises) {
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
