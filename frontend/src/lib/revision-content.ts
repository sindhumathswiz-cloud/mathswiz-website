import { parseLLMJson } from './llm-json';

/**
 * Revision content: the reference text of a book chapter (definitions, theorem
 * statements, formulas, properties, key points) saved so it can feed revision
 * sheets and flashcards.
 *
 * Standing rule for the whole pipeline: never fabricate. The model is only a
 * finder that copies text it is shown; this module then checks every item
 * against the page it claims to come from (verbatimScore) and nothing reaches a
 * student without an admin approving it. Flashcards are derived mechanically
 * from an item -- no model is involved in writing a card.
 */

export const REVISION_KINDS = ['DEFINITION', 'THEOREM', 'FORMULA', 'PROPERTY', 'KEY_POINT'] as const;
export type RevisionKind = (typeof REVISION_KINDS)[number];

export const KIND_LABEL: Record<RevisionKind, string> = {
  DEFINITION: 'Definitions',
  THEOREM: 'Theorems & results',
  FORMULA: 'Formulas',
  PROPERTY: 'Properties',
  KEY_POINT: 'Key points',
};

export interface ExtractedRevisionItem {
  kind: RevisionKind;
  title: string;
  body: string;
  sourcePage: number;
}

export interface PageText {
  pageNumber: number;
  text: string;
}

// A copy that matches its source page exactly (after normalization) is EXACT. A
// near-miss is CLOSE: a single changed digit in a formula still shares most of
// its text with the page, so closeness is never enough to trust on its own --
// it only tells the reviewer where to look. Anything lower is a MISMATCH.
export const VERBATIM_CLOSE = 0.92;
export type VerbatimTier = 'EXACT' | 'CLOSE' | 'MISMATCH';

export function verbatimTier(score: number | null | undefined): VerbatimTier {
  if (score === 1) return 'EXACT';
  if (typeof score === 'number' && score >= VERBATIM_CLOSE) return 'CLOSE';
  return 'MISMATCH';
}
const MAX_TITLE = 140;
const MAX_BODY = 2400;
const MIN_BODY = 6;

export function buildRevisionPrompt(pages: PageText[]): { system: string; user: string } {
  const system = `You find reference content in the text of a mathematics textbook chapter and copy it out, as strict JSON. You never write, complete, correct, simplify or explain anything yourself.

Return ONLY: { "items": [ { "kind", "title", "body", "sourcePage" } ] }

WHAT TO COPY (only if it is explicitly printed in the text):
- DEFINITION: a definition of a term or concept.
- THEOREM: the STATEMENT of a theorem, lemma, corollary or named result. Statement only -- never the proof.
- FORMULA: a formula, identity or standard result, together with the condition it holds under if one is printed beside it. Keep a small group of closely related formulas as one item.
- PROPERTY: a listed property or rule (for example properties of determinants or of definite integrals).
- KEY_POINT: a "Key points" / "Quick revision" / "Remember" item that states a fact or rule.

WHAT TO LEAVE OUT: questions, exercises, solved examples and their working, solutions, ANSWER KEYS and lists of numbered final answers or results to exercises (for example "1. (b)  2. pi/2  3. 4x+C"), hints, proofs, exam tips, board-paper advice, advertisements, page headers and footers. A bare number or expression that is the answer to a numbered question is NOT a formula. Likewise, a specific integral, equation or expression shown with its result as part of a worked example or exercise is NOT a formula; a formula is a general rule or standard result.

RULES
- body must be COPIED EXACTLY as printed. Do not paraphrase, shorten, reorder, merge sources, fill in missing steps or fix anything. Keep the math exactly as it appears in the text, character for character: the same LaTeX commands, the same $ delimiters, the same spacing and braces. Do not tidy, reformat, shorten or "fix" the LaTeX. Because the reply is JSON, every backslash in a string must be written as a DOUBLE backslash: the LaTeX \\frac{a}{b} is written "\\\\frac{a}{b}" in the JSON string, and \\int is written "\\\\int".
- If the text of an item is cut off, garbled or unreadable, leave that item out entirely.
- title: the heading as printed when there is one (e.g. "Lagrange's Mean Value Theorem"); otherwise a short plain name for the rule or concept (at most 8 words). The title is a label only: never put content in it, and never describe the particular expression of an example in it.
- sourcePage: the page number from the "=== PAGE n ===" marker the item appears under.
- If a page contains no reference content, return nothing for it. An empty list is a correct answer.`;
  const user = pages.map(page => `=== PAGE ${page.pageNumber} ===\n${page.text.trim()}`).join('\n\n');
  return { system, user };
}

/**
 * False when the reply is not JSON we can read. That is not the same as "no
 * reference content on these pages" (which is a readable, empty list), and must
 * not be mistaken for it: a truncated or badly escaped reply used to look exactly
 * like a page with nothing on it.
 */
export function isReadableReply(raw: string | null | undefined): boolean {
  if (!raw || !raw.trim()) return false;
  return parseLLMJson(raw) !== null;
}

function cleanText(value: unknown, max: number): string {
  return typeof value === 'string' ? value.replace(/\r/g, '').trim().slice(0, max).trim() : '';
}

/**
 * Validates the model's reply: unknown kinds, empty or too-short bodies and
 * items pointing at a page that was not in the request are dropped (a source
 * page we cannot verify against is a source page we cannot trust).
 */
export function parseRevisionItems(raw: string | null | undefined, validPages: number[]): ExtractedRevisionItem[] {
  const parsed = parseLLMJson<{ items?: unknown }>(raw);
  const list = Array.isArray(parsed?.items) ? parsed!.items : Array.isArray(parsed) ? (parsed as unknown[]) : [];
  const allowed = new Set(validPages);
  const items: ExtractedRevisionItem[] = [];
  for (const entry of list) {
    if (!entry || typeof entry !== 'object') continue;
    const record = entry as Record<string, unknown>;
    const kind = typeof record.kind === 'string' ? record.kind.toUpperCase().replace(/[\s-]+/g, '_') : '';
    if (!(REVISION_KINDS as readonly string[]).includes(kind)) continue;
    const title = cleanText(record.title, MAX_TITLE);
    const body = cleanText(record.body, MAX_BODY);
    const sourcePage = Number(record.sourcePage);
    if (!title || body.length < MIN_BODY || !allowed.has(sourcePage)) continue;
    items.push({ kind: kind as RevisionKind, title, body, sourcePage });
  }
  return items;
}

/**
 * Collapses everything that can legitimately differ between the printed text and
 * a LaTeX rendering of it -- delimiters, spacing commands, braces, case -- so
 * two copies of the same content compare equal.
 */
export function normalizeForMatch(text: string): string {
  return text
    .toLowerCase()
    .replace(/\\[dt]frac/g, '\\frac')
    .replace(/\\left|\\right|\\displaystyle|\\,|\\;|\\:|\\!|\\ |\\quad|\\qquad/g, '')
    .replace(/\\[()[\]]/g, '')
    .replace(/[$\s{}]/g, '');
}

const SHINGLE = 6;

/** 0-1: how much of `body` is found, in order, in the page text it was taken from. */
export function verbatimScore(body: string, sourceText: string): number {
  const needle = normalizeForMatch(body);
  const haystack = normalizeForMatch(sourceText);
  if (!needle || !haystack) return 0;
  if (haystack.includes(needle)) return 1;
  if (needle.length < SHINGLE) return 0;
  const grams = new Set<string>();
  for (let i = 0; i + SHINGLE <= haystack.length; i++) grams.add(haystack.slice(i, i + SHINGLE));
  let total = 0;
  let found = 0;
  for (let i = 0; i + SHINGLE <= needle.length; i++) {
    total++;
    if (grams.has(needle.slice(i, i + SHINGLE))) found++;
  }
  return total === 0 ? 0 : Math.round((found / total) * 1000) / 1000;
}

/**
 * Where in the pages shown to the model an item really comes from. A model often
 * cites the wrong page of a batch (a formula group that runs over a page break
 * is the usual case), so the claimed page is tried first and then the others;
 * an item is only treated as unsupported if it is found nowhere. A copy that
 * spans a page break is still found, in the pages joined in order. The score is
 * returned as the best of the above, and the page is the one that matched best.
 */
export function locateInPages(body: string, pages: PageText[], claimedPage: number): { sourcePage: number; score: number } {
  const claimed = pages.find(page => page.pageNumber === claimedPage);
  let best = { sourcePage: claimedPage, score: claimed ? verbatimScore(body, claimed.text) : 0 };
  if (best.score === 1) return best;
  for (const page of pages) {
    if (page.pageNumber === claimedPage) continue;
    const score = verbatimScore(body, page.text);
    if (score > best.score) best = { sourcePage: page.pageNumber, score };
  }
  if (best.score < 1) {
    const joined = verbatimScore(body, pages.map(page => page.text).join('\n'));
    if (joined > best.score) best = { sourcePage: best.sourcePage, score: joined };
  }
  return best;
}

const NEAR_DUPLICATE_MIN = 30;

/**
 * True when `body` is the same passage as one already saved, even if a re-run
 * trimmed or extended it by a few words: one normalized text contains the other.
 * Very short texts are only duplicates when identical, so a short formula is not
 * swallowed by a longer item that merely mentions it.
 */
export function isNearDuplicate(body: string, existingBodies: string[]): boolean {
  const candidate = normalizeForMatch(body);
  if (!candidate) return false;
  return existingBodies.some(existing => {
    const other = normalizeForMatch(existing);
    if (candidate === other) return true;
    const [short, long] = candidate.length <= other.length ? [candidate, other] : [other, candidate];
    return short.length >= NEAR_DUPLICATE_MIN && long.includes(short);
  });
}

/** True when every inline/display math span in the text is closed (an even number of unescaped `$`). */
export function mathIsBalanced(text: string): boolean {
  const dollars = text.replace(/\\\$/g, '').match(/\$/g);
  return (dollars?.length ?? 0) % 2 === 0;
}

/**
 * OCR'd text often runs math straight into the words around it ("function$f(x)$is").
 * This puts a space on the outside of each math span where the text touches it,
 * for display only: nothing inside a span, and no word, is changed. Spans are
 * paired by walking the `$` signs in order, so `$$` display math is handled too.
 */
export function spaceMathBoundaries(text: string): string {
  let out = '';
  let open = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '\\' && text[i + 1] === '$') { out += '\\$'; i++; continue; }
    if (ch !== '$') { out += ch; continue; }
    const delimiter = text[i + 1] === '$' ? '$$' : '$';
    if (!open) {
      if (out.length > 0 && !/[\s([{"'“‘]$/.test(out)) out += ' ';
      out += delimiter;
      open = true;
    } else {
      out += delimiter;
      const next = text[i + delimiter.length];
      if (next !== undefined && /[A-Za-z0-9]/.test(next)) out += ' ';
      open = false;
    }
    i += delimiter.length - 1;
  }
  return out;
}

export interface CardSource { kind: RevisionKind; title: string; body: string }

/** A flashcard is the item itself, asked as a question -- the back is the book's own text. */
export function flashcardFromItem(item: CardSource): { front: string; back: string } {
  const title = item.title.trim();
  const front = {
    DEFINITION: `Define: ${title}`,
    THEOREM: `State: ${title}`,
    FORMULA: `Write the formula: ${title}`,
    PROPERTY: `Recall the property: ${title}`,
    KEY_POINT: title,
  }[item.kind];
  return { front, back: spaceMathBoundaries(item.body) };
}

export function groupByKind<T extends { kind: RevisionKind }>(items: T[]): Array<{ kind: RevisionKind; label: string; items: T[] }> {
  return REVISION_KINDS
    .map(kind => ({ kind, label: KIND_LABEL[kind], items: items.filter(item => item.kind === kind) }))
    .filter(group => group.items.length > 0);
}

/** Batches a chapter's pages so each model call stays within a safe amount of text. */
export function batchPages(pages: PageText[], maxChars = 14000, maxPages = 6): PageText[][] {
  const batches: PageText[][] = [];
  let current: PageText[] = [];
  let size = 0;
  for (const page of pages) {
    const length = page.text.length;
    if (current.length > 0 && (size + length > maxChars || current.length >= maxPages)) {
      batches.push(current);
      current = [];
      size = 0;
    }
    current.push(page);
    size += length;
  }
  if (current.length > 0) batches.push(current);
  return batches;
}

/**
 * Cards from different items can end up with the same front (two groups of
 * "Some Standard Integrals"), which makes them indistinguishable when studying.
 * A repeated front gets its source page appended, and a number if that still
 * collides, so every card in a deck asks a different question.
 */
export function withUniqueFronts<T extends { front: string; sourcePage: number }>(cards: T[]): T[] {
  const counts = new Map<string, number>();
  for (const card of cards) counts.set(card.front, (counts.get(card.front) ?? 0) + 1);
  const seen = new Map<string, number>();
  return cards.map(card => {
    if ((counts.get(card.front) ?? 0) < 2) return card;
    let front = `${card.front} (p. ${card.sourcePage})`;
    const n = (seen.get(front) ?? 0) + 1;
    seen.set(front, n);
    if (n > 1 || cards.filter(other => other.front === card.front && other.sourcePage === card.sourcePage).length > 1) front = `${front} #${n}`;
    return { ...card, front };
  });
}
