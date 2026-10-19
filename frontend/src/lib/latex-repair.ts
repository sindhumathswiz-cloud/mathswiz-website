import { latexRenders, mathBlocks } from '@/lib/question-qa';
import { sanitizeLatex } from '@/lib/latex-sanitize';

/**
 * Mechanical repair of LaTeX that will not render, for questions the QA passes reported.
 *
 * It only ever (a) deletes stray `$` delimiters, (b) restores a backslash that a JSON/OCR
 * escape swallowed (`\f` + "rac" for `\frac`), (c) collapses a doubled backslash in front of a
 * command, or (d) drops a `\left` / `\right` that has no partner (keeping its bracket).
 * Nothing is ever added, reworded or invented. A field is changed only when the result
 * renders completely; otherwise it is returned exactly as it came in.
 */

export interface RepairResult {
  text: string;
  changed: boolean;
  /** Which kinds of fix were needed, for the audit note. */
  fixes: string[];
  /** True if the field still does not render (it is returned unchanged in that case). */
  stillBroken: boolean;
}

const UNESCAPED_DOLLAR = /(?<!\\)\$/g;

/** A field is sound when its `$` delimiters pair up and every math block in it renders. */
export function fieldRenders(text: string): boolean {
  if (!text) return true;
  if (((text.match(UNESCAPED_DOLLAR) ?? []).length % 2) !== 0) return false;
  return mathBlocks(sanitizeLatex(text)).every(latexRenders);
}

// Control characters left where `\f`, `\t`, `\b`... met a JSON/OCR escape, with the letters that follow them.
const CONTROL_CHAR_FIXES: Array<[RegExp, string]> = [
  [/\f(?=rac\{|rac\s)/g, '\\f'],
  [/\t(?=ext\{|imes|heta|au\b|ilde|riangle|an\b)/g, '\\t'],
  [/\x08(?=eta|egin\{|oldsymbol|ar\{|inom)/g, '\\b'],
  [/\r(?=ight|ho\b|ightarrow)/g, '\\r'],
  [/\x07(?=lpha)/g, '\\a'],
  [/\x0b(?=ec\{|arepsilon)/g, '\\v'],
];

/** The letters of `\frac` etc. with the backslash replaced by a control character (or dropped as "rac{"). */
export function fixSwallowedBackslashes(text: string): string {
  let result = text;
  for (const [pattern, replacement] of CONTROL_CHAR_FIXES) result = result.replace(pattern, replacement);
  // The control character is sometimes lost entirely, leaving "(rac{1}{x}" where "(\frac{1}{x}" was.
  result = result.replace(/(?<![A-Za-z\\])rac\{/g, '\\frac{');
  return result;
}

const DOUBLED_BACKSLASH_COMMANDS = 'frac|dfrac|int|Big|Bigg|left|right|sqrt|sin|cos|tan|log|ln|pi|theta|infty|cdot|times|quad|lim|sum|alpha|beta|text';

/** `\\frac` -> `\frac` where a line break cannot be what was meant (it is followed by a command word). */
export function fixDoubledBackslashes(text: string): string {
  return text.replace(new RegExp(`\\\\\\\\(?=(?:${DOUBLED_BACKSLASH_COMMANDS})(?![A-Za-z]))`, 'g'), '\\');
}

/** Positions of `$` that could be strays: members of a run of two or more, or a `$` alone on its line. */
function candidateDollarPositions(text: string): number[] {
  const positions: number[] = [];
  const re = /(?<!\\)\$+/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(text))) {
    const start = match.index;
    const length = match[0].length;
    if (length >= 2) {
      for (let i = 0; i < length; i++) positions.push(start + i);
    } else {
      const before = text.slice(0, start).split('\n').pop() ?? '';
      const after = text.slice(start + 1).split('\n')[0] ?? '';
      if (before.trim() === '' && after.trim() === '') positions.push(start);
    }
  }
  return positions;
}

function removeAt(text: string, positions: number[]): string {
  const drop = new Set(positions);
  let out = '';
  for (let i = 0; i < text.length; i++) if (!drop.has(i)) out += text[i];
  return out;
}

/**
 * The smallest set of stray `$` (up to three) whose removal makes the field render, or null.
 * Smaller sets are tried first, so the least change that works is the one used.
 */
export function removeStrayDollars(text: string): string | null {
  const candidates = candidateDollarPositions(text).slice(0, 24);
  if (candidates.length === 0) return null;
  const n = candidates.length;
  for (let size = 1; size <= 3; size++) {
    const pick: number[] = [];
    const search = (from: number): string | null => {
      if (pick.length === size) {
        const attempt = removeAt(text, pick.map(i => candidates[i]));
        return fieldRenders(attempt) ? attempt : null;
      }
      for (let i = from; i < n; i++) {
        pick.push(i);
        const found = search(i + 1);
        pick.pop();
        if (found !== null) return found;
      }
      return null;
    };
    const found = search(0);
    if (found !== null) return found;
  }
  return null;
}

/** Remove `\left` / `\right` that have no partner, keeping the bracket they carried. */
export function dropUnmatchedLeftRight(input: string): string {
  // The renderer removes an invisible bracket (backslash-left-dot, backslash-right-dot) before KaTeX sees
  // it, which can leave the other half of a pair, such as a closing square bracket after an evaluation
  // bar, without a partner. Pair up what is left.
  const text = input.replace(/\\(?:left|right)\./g, '');
  const tokens: Array<{ index: number; kind: 'left' | 'right' }> = [];
  const re = /\\(left|right)(?![A-Za-z])/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(text))) tokens.push({ index: match.index, kind: match[1] as 'left' | 'right' });
  const open: number[] = [];
  const unmatched = new Set<number>();
  tokens.forEach((token, i) => {
    if (token.kind === 'left') open.push(i);
    else if (open.length > 0) open.pop();
    else unmatched.add(i);
  });
  open.forEach(i => unmatched.add(i));
  if (unmatched.size === 0) return text;
  let out = '';
  let cursor = 0;
  tokens.forEach((token, i) => {
    if (!unmatched.has(i)) return;
    out += text.slice(cursor, token.index);
    cursor = token.index + token.kind.length + 1; // skip the backslash and the word
  });
  return out + text.slice(cursor);
}

/**
 * The text with everything these repairs may touch taken out: $ delimiters, invisible or unmatched
 * \left/\right, whitespace, swallowed-backslash letters and doubled backslashes. Two texts with the same
 * skeleton read the same; if a repair changes the skeleton it changed something it should not have.
 */
export function readingSkeleton(text: string): string {
  return text
    .replace(/(?<!\\)\$/g, '')
    .replace(/\\(?:left|right)\.?(?![A-Za-z])/g, '')
    .replace(/[\s\f\t\b\r\x07\x0b]/g, '')
    .replace(/\\\\(?=[A-Za-z])/g, '\\')
    .replace(/\\?[fF]?rac\{/g, 'frac{');
}

/** Repairs one text field. Returns it unchanged unless the repaired text renders completely. */
export function repairLatexField(text: string): RepairResult {
  if (!text || fieldRenders(text)) return { text, changed: false, fixes: [], stillBroken: false };

  let current = text;
  const fixes: string[] = [];
  // A repair that renders is still refused if it changed anything beyond delimiters and escapes.
  const accept = (candidate: string): RepairResult => readingSkeleton(candidate) === readingSkeleton(text)
    ? { text: candidate, changed: candidate !== text, fixes, stillBroken: false }
    : { text, changed: false, fixes: [], stillBroken: true };
  const steps: Array<[string, (value: string) => string | null]> = [
    ['restored swallowed backslashes', fixSwallowedBackslashes],
    ['collapsed doubled backslashes', fixDoubledBackslashes],
    ['removed stray $ delimiters', removeStrayDollars],
    ['removed unmatched \\left/\\right', dropUnmatchedLeftRight],
  ];

  for (const [label, step] of steps) {
    const next = step(current);
    if (next !== null && next !== current) {
      current = next;
      fixes.push(label);
    }
    if (fieldRenders(current)) return accept(current);
  }

  // Cumulative fixes can unlock the dollar search, which is the one most likely to need the others first.
  const retry = removeStrayDollars(current);
  if (retry !== null) {
    if (!fixes.includes('removed stray $ delimiters')) fixes.push('removed stray $ delimiters');
    return accept(retry);
  }
  return { text, changed: false, fixes: [], stillBroken: true };
}
