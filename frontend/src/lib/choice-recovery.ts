/**
 * Recovering what a bad import left in the wrong place, never what it never had.
 *
 *  - splitInlineOptions: options written inline in the question text, "(a) ... (b) ... (c) ... (d) ...",
 *    are moved into the options list. Only the existing words move; none are added or changed.
 *  - answerFromSolution: the printed solution's final result is compared with the options; the answer is
 *    taken only if exactly one option matches it exactly. That is reading the source's own working, not
 *    solving the question.
 */

export interface SplitOptions {
  stem: string;
  options: string[];
}

const LABEL = /\(\s*([a-eA-E])\s*\)/g;

/** Text with the (a)/(b) labels and all whitespace taken out, to prove nothing was lost or added. */
const withoutLabels = (text: string) => text.replace(LABEL, '').replace(/\s+/g, '');

export function splitInlineOptions(content: string): SplitOptions | null {
  const labels = [...content.matchAll(LABEL)].map(m => ({ letter: m[1].toLowerCase(), start: m.index!, end: m.index! + m[0].length }));
  // Find the first "(a)" that is followed, in order, by (b), (c) ... with no gaps.
  for (let i = 0; i < labels.length; i++) {
    if (labels[i].letter !== 'a') continue;
    const run = [labels[i]];
    let expected = 'b';
    for (let j = i + 1; j < labels.length && run.length < 5; j++) {
      if (labels[j].letter === expected) { run.push(labels[j]); expected = String.fromCharCode(expected.charCodeAt(0) + 1); }
    }
    if (run.length < 3) continue;
    const stem = content.slice(0, run[0].start).trim();
    const options = run.map((label, index) => content.slice(label.end, index + 1 < run.length ? run[index + 1].start : content.length).trim());
    if (stem.length < 5 || options.some(option => option.length === 0)) continue;
    // Nothing may be lost or invented: stem and options together are exactly the original minus the labels.
    if (withoutLabels(stem + options.join('')) !== withoutLabels(content)) continue;
    return { stem, options };
  }
  return null;
}

/** Whitespace, $ and invisible sizing commands removed; everything that carries meaning kept. */
const normalise = (math: string) => math
  .replace(/\\(?:left|right)(?![A-Za-z])/g, '')
  .replace(/\\[,;:!]/g, '')
  .replace(/\\(?:quad|qquad)(?![A-Za-z])/g, '')
  .replace(/[\s$]/g, '')
  .replace(/\.$/, '')
  .toLowerCase();

function lastMath(text: string): string | null {
  const blocks = [...text.matchAll(/\$\$([\s\S]*?)\$\$|\$([^$\n][\s\S]*?)\$/g)].map(m => (m[1] ?? m[2] ?? '').trim()).filter(Boolean);
  return blocks.length > 0 ? blocks[blocks.length - 1] : null;
}

/**
 * The option letter whose text equals the printed solution's final result, if exactly one does.
 * The final result is the last math expression in the explanation, or the part after its last "=".
 */
export function answerFromSolution(options: string[], explanation: string): string | null {
  const final = lastMath(explanation);
  if (!final || options.length < 2) return null;
  const targets = new Set([normalise(final)]);
  const afterEquals = final.split('=').pop();
  if (final.includes('=') && afterEquals) targets.add(normalise(afterEquals));
  const matches = options
    .map((option, index) => ({ letter: String.fromCharCode(65 + index), text: normalise(option) }))
    .filter(option => option.text.length > 0 && (targets.has(option.text) || [...targets].some(t => t.endsWith('=' + option.text))));
  const letters = new Set(matches.map(m => m.letter));
  const distinctTexts = new Set(matches.map(m => m.text));
  // Two matching options, or two identical-looking options, would make the choice a guess.
  return letters.size === 1 && distinctTexts.size === 1 && new Set(options.map(normalise)).size === options.length ? [...letters][0] : null;
}
