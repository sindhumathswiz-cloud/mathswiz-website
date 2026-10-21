import { sourceAgreement } from './source-agreement';

/**
 * Worked solutions printed straight after their question ("17. If x = ... Sol. We have ...") -- the layout of most
 * sections in CBSE practice books such as Xam Idea. Extraction keeps such a solution only when the model returns it,
 * and a fallback model's answers and solutions are stripped as unverifiable (structure-questions.ts), so many
 * questions lose a solution that is printed right under them. This finds that printed text again by the question's
 * printed number: a copy of the page, never something solved.
 *
 * Page text is OCR markdown, where a question often starts mid-line, straight after the closing "$" of the previous
 * solution's maths ("...\end{array}$16. Find ..."), and every page ends with a running footer ("Continuity and
 * Differentiability 143"). A solution runs until the next question number, a section heading, or the end of the
 * pages given -- across a page turn if need be, with the footer between the pages removed.
 */

export interface PageText {
  pageNumber: number;
  text: string;
}

export type InlineSolutionResult =
  | { found: true; text: string; startPage: number; endPage: number; agreement: number; answerLetter?: string | null }
  | { found: false; reason: 'question_not_found' | 'no_solution_printed' | 'no_end_found' | 'too_long' | 'subpart_not_found' | 'unsupported_number' };

/** How much of the question's text must be found at its number on the page to be sure it is that question. */
export const QUESTION_AGREEMENT_MIN = 0.6;
const MAX_SOLUTION_CHARS = 8000;

// Where one section ends and the next begins; a solution never runs past one.
const SECTION_HEADING = /(?:selected\s+ncert\s+questions|multiple\s+choice\s+questions|case[\s-]*based|very\s+short\s+answer\s+questions|short\s+answer\s+questions|long\s+answer\s+questions|proficiency\s+exercise|self[\s-]*assessment|exam\s+bites|(?:^|\n)\s*answers\b)/i;

// A trailing "<words> <page number>" or "<page number> <words>" with no maths in it: a running footer candidate.
const FOOTER_TAIL = /(?:^|[\n$])\s*((?:[A-Za-z][A-Za-z&,'\- ]{2,60}\s+\d{1,4})|(?:\d{1,4}\s+[A-Za-z][A-Za-z&,'\- ]{2,60}))\s*$/;
const footerKey = (segment: string) => segment.replace(/\d+/g, '').replace(/\s+/g, ' ').trim().toLowerCase();

/** The running footers of a book: trailing title-and-page-number lines that recur on at least `minPages` pages. */
export function runningFooters(pageTexts: string[], minPages = 3): Set<string> {
  const counts = new Map<string, number>();
  for (const text of pageTexts) {
    const m = text.match(FOOTER_TAIL);
    if (m) counts.set(footerKey(m[1]), (counts.get(footerKey(m[1])) ?? 0) + 1);
  }
  return new Set([...counts].filter(([, n]) => n >= minPages).map(([key]) => key));
}

/** The page text without its running footer, when it ends with one of the book's footers. */
export function stripRunningFooter(text: string, footers: Set<string>): string {
  const m = text.match(FOOTER_TAIL);
  if (!m || !footers.has(footerKey(m[1]))) return text;
  return text.slice(0, text.length - m[0].length + (m[0].startsWith('$') ? 1 : 0)).trimEnd();
}

/**
 * OCR markdown closes one inline formula and opens the next with no space between ("...\right)$$\begin{aligned}..."),
 * which reads as a display-math "$$" and pairs every later "$" wrongly. Display maths sits on lines of its own, so a
 * "$$" with text on both sides on one line is two inline marks.
 */
export function splitTouchingInlineMath(text: string): string {
  return text.split('\n').map((line) => line.replace(/(\S)\$\$(?=\S)/g, '$1$ $')).join('\n');
}

const leadingNumber = (printed: string) => printed.match(/\d+/)?.[0] ?? null;

/**
 * Every place question `n` could start: its number after the start of the text, a line break or a closing "$", then
 * a space or straight into maths ("2.$y = x ..."), but not a decimal ("2.5").
 */
function questionStarts(text: string, n: string): number[] {
  const re = new RegExp(`(?:^|[\\n$])[ \\t]*(?:\\*\\*)?${n}\\.(?:\\s+(?=\\S)|(?=\\$))`, 'g');
  const out: number[] = [];
  for (const m of text.matchAll(re)) out.push((m.index ?? 0) + (m[0].startsWith('$') ? 1 : 0));
  return out;
}

interface Stream {
  text: string;
  firstPageEnd: number;
  pageAt: (index: number) => number;
}

/** One stream of text from `startPage` on, footers removed, remembering where each page begins. */
function streamFrom(pages: PageText[], startPage: number, footers: Set<string>): Stream | null {
  const first = pages.findIndex((p) => p.pageNumber === startPage);
  if (first < 0) return null;
  const offsets: Array<{ at: number; pageNumber: number }> = [];
  let text = '';
  for (const page of pages.slice(first)) {
    if (text) text += '\n';
    offsets.push({ at: text.length, pageNumber: page.pageNumber });
    text += stripRunningFooter(page.text, footers);
  }
  return {
    text,
    firstPageEnd: offsets[1]?.at ?? text.length,
    pageAt: (index: number) => [...offsets].reverse().find((o) => o.at <= index)?.pageNumber ?? startPage,
  };
}

const ROMAN = ['i', 'ii', 'iii', 'iv', 'v', 'vi', 'vii', 'viii'];

/**
 * A case-study sub-part's printed number -- "(iii)", "iii", "2(iii)" or "2.(iii)" -- as its case number (when given)
 * and the part. Null for anything else, including a part of a part ("(i)(b)"), which this does not place.
 */
export function parseSubpartNumber(printed: string): { caseNumber: string | null; part: string } | null {
  const m = printed.trim().match(/^(?:(\d{1,2})\s*\.?\s*)?\(?\s*(i|ii|iii|iv|v|vi|vii|viii)\s*\)?$/i);
  return m ? { caseNumber: m[1] ?? null, part: m[2].toLowerCase() } : null;
}

/** True for a printed number that names a sub-part at all, placeable or not ("(i)", "2(iii)", "(i)(b)"). */
export const looksLikeSubpart = (printed: string) => /\((?:i|ii|iii|iv|v|vi|vii|viii|ix|x)\)|^(?:i|ii|iii|iv|v|vi|vii|viii)$/i.test(printed.trim());

const labelAt = (text: string, part: string, from = 0) => {
  const i = text.slice(from).search(new RegExp(`\\(\\s*${part}\\s*\\)`, 'i'));
  return i < 0 ? -1 : from + i;
};
// The book's case-study answers end each part with "∴ Option (c) is correct." (sometimes inside the maths as text).
const CORRECT = /Option\s*(?:\}\s*)?(?:\\text\s*\{\s*)?\(?\s*([a-d])\s*\)?\s*(?:\}\s*)?(?:\\text\s*\{\s*)?is\s+correct/gi;

/**
 * The printed solution (and, for a multiple-choice part, the printed answer letter) of one sub-part of a case study:
 * "N. Read the following ... (i) ... (v) ... Sol. (i) ... Option (c) is correct. (ii) ...". The sub-question must be
 * found on its page with its own text; its case's "Sol." must follow before another numbered question; and a part's
 * working is cut at the "is correct" that closes it, so an equation label "(ii)" inside part (i)'s working is not
 * taken for part (ii).
 */
export function findCaseSubpartSolution(input: { pages: PageText[]; startPage: number; printedNumber: string; questionContent: string; footers?: Set<string> }): InlineSolutionResult {
  const parsed = parseSubpartNumber(input.printedNumber);
  if (!parsed) return { found: false, reason: 'unsupported_number' };
  const s = streamFrom(input.pages, input.startPage, input.footers ?? new Set());
  if (!s) return { found: false, reason: 'question_not_found' };
  const { text } = s;
  const anyQuestion = /(?:^|[\n$])[ \t]*(?:\*\*)?(\d{1,2})\.(?:\s+(?=\S)|(?=\$))/g;
  const numberedStarts = [...text.matchAll(anyQuestion)].map((m) => ({ at: (m.index ?? 0) + (m[0].startsWith('$') ? 1 : 0), n: m[1] }));

  // The sub-question: its label on its own page, followed by text that agrees with its content.
  let best: { at: number; agreement: number } | null = null;
  for (let at = labelAt(text, parsed.part); at >= 0 && at < s.firstPageEnd; at = labelAt(text, parsed.part, at + 1)) {
    const window = text.slice(at, at + Math.max(80, input.questionContent.length * 2));
    const agreement = sourceAgreement(input.questionContent.replace(/^\s*\(\s*[ivx]+\s*\)\s*/i, ''), window);
    if (!best || agreement > best.agreement) best = { at, agreement };
  }
  if (!best || best.agreement < QUESTION_AGREEMENT_MIN) return { found: false, reason: 'question_not_found' };
  // Its case number, when the printed number gives one, must be the numbered question it sits under.
  const caseStart = [...numberedStarts].reverse().find((q) => q.at < best!.at);
  if (parsed.caseNumber && caseStart?.n !== parsed.caseNumber) return { found: false, reason: 'question_not_found' };

  // The case's solution: the first "Sol." after the sub-question, with no other numbered question in between.
  const solRel = text.slice(best.at).search(/(?:^|[\s$\]])Sol(?:ution)?\.?(?=[\s$:(])/);
  if (solRel < 0) return { found: false, reason: 'no_solution_printed' };
  const sol = best.at + solRel + text.slice(best.at + solRel).search(/Sol/);
  if (numberedStarts.some((q) => q.at > best!.at && q.at < sol)) return { found: false, reason: 'no_solution_printed' };
  const nextCase = numberedStarts.find((q) => q.at > sol)?.at;
  const heading = text.slice(sol).search(SECTION_HEADING);
  const blockEnd = Math.min(nextCase ?? Infinity, heading > 0 ? sol + heading : Infinity);
  if (!Number.isFinite(blockEnd)) return { found: false, reason: 'no_end_found' };
  const block = text.slice(sol, blockEnd);

  // Each part's label in turn: part (k+1) is the first label after the "is correct" that closes part k; without
  // those closing lines (a written case study), it must start a line.
  const closes = [...block.matchAll(CORRECT)].map((m) => ({ at: m.index ?? 0, end: (m.index ?? 0) + m[0].length, letter: m[1].toUpperCase() }));
  const nextLabel = (k: number, after: number): number => {
    if (closes.length) {
      const close = closes.find((c) => c.at > after);
      return close ? labelAt(block, ROMAN[k], close.end) : -1;
    }
    const m = block.slice(after + 1).search(new RegExp(`\\n[ \\t]*\\(\\s*${ROMAN[k]}\\s*\\)`, 'i'));
    return m < 0 ? -1 : after + 1 + m + block.slice(after + 1 + m).search(/\(/);
  };
  const index = ROMAN.indexOf(parsed.part);
  let at = labelAt(block, ROMAN[0]);
  for (let k = 1; k <= index && at >= 0; k++) at = nextLabel(k, at);
  if (at < 0) return { found: false, reason: 'subpart_not_found' };
  // A multiple-choice part must close with its "is correct" line; its working runs on to the next part's label (so a
  // closing "\end{array}$" after that line stays with it), or to the end of the case's solution for the last part.
  const close = closes.find((c) => c.at > at);
  if (closes.length && !close) return { found: false, reason: 'subpart_not_found' };
  const following = index + 1 < ROMAN.length ? nextLabel(index + 1, at) : -1;
  const end = following > at ? following : block.length;
  const answerLetter = close && close.at < end ? close.letter : null;
  const part = splitTouchingInlineMath(block.slice(at, end).replace(new RegExp(`^\\(\\s*${parsed.part}\\s*\\)\\s*`, 'i'), '').trim());
  if (!part) return { found: false, reason: 'subpart_not_found' };
  if (part.length > MAX_SOLUTION_CHARS) return { found: false, reason: 'too_long' };
  return { found: true, text: part, startPage: s.pageAt(sol + at), endPage: s.pageAt(sol + end - 1), agreement: best.agreement, answerLetter };
}

/**
 * The printed solution of the question numbered `printedNumber` that starts on `startPage`. `pages` must hold that
 * page and may hold the pages after it, in order, for a solution that runs over a page turn.
 */
export function findInlineSolution(input: { pages: PageText[]; startPage: number; printedNumber: string; questionContent: string; footers?: Set<string> }): InlineSolutionResult {
  if (looksLikeSubpart(input.printedNumber)) return findCaseSubpartSolution(input);
  const n = /^\s*\d+\s*\.?\s*$/.test(input.printedNumber) ? leadingNumber(input.printedNumber) : null;
  const s = n ? streamFrom(input.pages, input.startPage, input.footers ?? new Set()) : null;
  if (!n || !s) return { found: false, reason: n ? 'question_not_found' : 'unsupported_number' };
  const { text: stream, firstPageEnd, pageAt } = s;
  const next = String(Number(n) + 1);

  // The question: the start of number n on its own page whose text best agrees with the question's content.
  let best: { start: number; sol: number; agreement: number } | null = null;
  for (const start of questionStarts(stream, n).filter((s) => s < firstPageEnd)) {
    const nextQuestion = questionStarts(stream.slice(start + 1), next)[0];
    const until = nextQuestion != null ? start + 1 + nextQuestion : stream.length;
    const solAt = stream.slice(start, until).search(/(?:^|[\s$\]])Sol(?:ution)?\.?(?=[\s$:])/);
    const questionText = stream.slice(start, solAt >= 0 ? start + solAt : Math.min(until, start + input.questionContent.length * 2));
    const agreement = sourceAgreement(input.questionContent, questionText);
    if (!best || agreement > best.agreement) best = { start, sol: solAt >= 0 ? start + solAt : -1, agreement };
  }
  if (!best || best.agreement < QUESTION_AGREEMENT_MIN) return { found: false, reason: 'question_not_found' };
  if (best.sol < 0) return { found: false, reason: 'no_solution_printed' };

  // The solution: from "Sol." to the next question or section heading.
  const from = best.sol + stream.slice(best.sol).search(/Sol/);
  const body = stream.slice(from);
  const nextQuestion = questionStarts(body, next)[0];
  const heading = body.search(SECTION_HEADING);
  const ends = [nextQuestion, heading >= 0 ? heading : undefined].filter((x): x is number => x != null && x > 0);
  if (!ends.length) return { found: false, reason: 'no_end_found' };
  const end = Math.min(...ends);
  const text = splitTouchingInlineMath(body.slice(0, end).replace(/^Sol(?:ution)?\.?\s*/, '').trim());
  if (!text) return { found: false, reason: 'no_solution_printed' };
  if (text.length > MAX_SOLUTION_CHARS) return { found: false, reason: 'too_long' };
  return { found: true, text, startPage: pageAt(from), endPage: pageAt(from + end - 1), agreement: best.agreement };
}
