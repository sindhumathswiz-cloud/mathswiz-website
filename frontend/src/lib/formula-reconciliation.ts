/**
 * LaTeX-aware comparison primitives for the two-provider agreement check
 * (see page-reconciliation.ts). Extracted from the offline Phase QB pilot
 * script (scripts/analyze-phase-qb-mathpix-reconciliation.ts) so the
 * production route and the pilot analysis score formulas the same way.
 */

/** A block must agree at least this closely to be auto-passed. Pilot-tuned. */
export const AGREEMENT_THRESHOLD = 0.93;
/** Blocks with fewer tokens than this ("x", "2") carry no formula to dispute. */
export const MIN_COMPARABLE_TOKENS = 3;

export function latexTokens(value: string): string[] {
  return value
    .replace(/\\begin\{(?:array|aligned)\}(?:\{[^}]*\})?/g, ' ')
    .replace(/\\end\{(?:array|aligned)\}/g, ' ')
    .replace(/\\(?:text|operatorname)\s*\{([^}]*)\}/g, ' $1 ')
    .replace(/\\(?:left|right|quad|qquad|displaystyle|,|;|!)/g, ' ')
    .replace(/\\[dt]frac/g, '\\frac')
    .replace(/\\\(|\\\)|\\\[|\\\]/g, ' ')
    .replace(/\$+/g, ' ')
    .toLowerCase()
    .match(/\\[a-z]+|[a-z]+|\d+|[{}()[\]|^_=+\-*/.,]/g) ?? [];
}

/**
 * Token stream used for provider-vs-provider comparison. Stricter about what
 * matters and blind to what only reflects each provider's LaTeX style:
 * braces (x^{2} vs x^2), and spacing inside letter runs (d x vs dx).
 */
export function comparisonTokens(value: string): string[] {
  return latexTokens(value)
    .flatMap((token) => (/^[a-z]{2,}$/.test(token) ? token.split('') : [token]))
    .filter((token) => token !== '{' && token !== '}');
}

export function lcsLength(a: string[], b: string[]): number {
  const row = new Uint16Array(b.length + 1);
  for (let i = 1; i <= a.length; i += 1) {
    let diagonal = 0;
    for (let j = 1; j <= b.length; j += 1) {
      const previous = row[j];
      row[j] = a[i - 1] === b[j - 1] ? diagonal + 1 : Math.max(row[j], row[j - 1]);
      diagonal = previous;
    }
  }
  return row[b.length];
}

export function tokenSimilarity(a: string[], b: string[]): number {
  if (a.length === 0 && b.length === 0) return 1;
  return (2 * lcsLength(a, b)) / (a.length + b.length);
}

export function tokenDelta(a: string[], b: string[]): { aOnly: string[]; bOnly: string[] } {
  const counts = (items: string[]) => {
    const result = new Map<string, number>();
    for (const item of items) result.set(item, (result.get(item) ?? 0) + 1);
    return result;
  };
  const left = counts(a);
  const right = counts(b);
  const expand = (source: Map<string, number>, other: Map<string, number>) =>
    [...source.entries()].flatMap(([token, count]) => Array(Math.max(0, count - (other.get(token) ?? 0))).fill(token));
  return { aOnly: expand(left, right), bOnly: expand(right, left) };
}

function exponentAtoms(items: string[]): string[] {
  const atoms: string[] = [];
  for (let index = 0; index < items.length - 1; index += 1) {
    if (items[index] !== '^' && items[index] !== '_') continue;
    let cursor = index + 1;
    while (items[cursor] === '{' || items[cursor] === '(') cursor += 1;
    if (items[cursor]) atoms.push(`${items[index]}${items[cursor]}`);
  }
  return atoms.sort();
}

const IMPORTANT_TOKENS = new Set([
  '\\int', '\\sum', '\\prod', '\\pi', '\\alpha', '\\beta', '\\theta',
  '\\infty', '\\sqrt', '\\tan', '\\sin', '\\cos', '=', '+', '-', '|',
]);

export function criticalSignature(items: string[]) {
  return { operators: items.filter((item) => IMPORTANT_TOKENS.has(item)).sort(), scripts: exponentAtoms(items) };
}

function multisetContains(superset: string[], subset: string[]): boolean {
  const available = new Map<string, number>();
  for (const item of superset) available.set(item, (available.get(item) ?? 0) + 1);
  for (const item of subset) {
    const remaining = available.get(item) ?? 0;
    if (remaining === 0) return false;
    available.set(item, remaining - 1);
  }
  return true;
}

export type BlockComparison = {
  similarity: number;
  criticalDisagreement: boolean;
  reviewStatus: 'AGREEMENT_PASS' | 'HOLD_FOR_RECONCILIATION';
  /** Tokens present in only one provider's reading, for the reviewer. */
  blockOnlyTokens: string[];
  candidateOnlyTokens: string[];
};

/**
 * Compares one OCR block (a fragment of the page) against the other
 * provider's transcription of the whole page, supplied as candidate lines.
 *
 * A block is usually a fragment of a longer line, so plain similarity would
 * under-score a correct match. The score is therefore the better of
 * symmetric LCS similarity and containment (LCS over the block's own length)
 * when the candidate is at least as long. Operators and exponent/subscript
 * atoms that appear in the block but not in the candidate force a hold even
 * at a high score, since a single dropped "^2" or sign flips the maths.
 */
export function compareBlockToCandidates(blockText: string, candidates: string[]): BlockComparison {
  const blockTokens = comparisonTokens(blockText);
  let best: { score: number; critical: boolean; tokens: string[] } = { score: 0, critical: true, tokens: [] };
  for (const candidate of candidates) {
    const candidateTokens = comparisonTokens(candidate);
    if (candidateTokens.length === 0) continue;
    const lcs = lcsLength(blockTokens, candidateTokens);
    const symmetric = (2 * lcs) / (blockTokens.length + candidateTokens.length);
    const containment = candidateTokens.length >= blockTokens.length ? lcs / blockTokens.length : 0;
    const score = Math.max(symmetric, containment);
    if (score > best.score) {
      const blockSignature = criticalSignature(blockTokens);
      const candidateSignature = criticalSignature(candidateTokens);
      const critical = !(
        multisetContains(candidateSignature.operators, blockSignature.operators) &&
        multisetContains(candidateSignature.scripts, blockSignature.scripts)
      );
      best = { score, critical, tokens: candidateTokens };
    }
  }
  const delta = tokenDelta(blockTokens, best.tokens);
  const passes = best.score >= AGREEMENT_THRESHOLD && !best.critical;
  return {
    similarity: Number(best.score.toFixed(4)),
    criticalDisagreement: best.critical && best.score > 0,
    reviewStatus: passes ? 'AGREEMENT_PASS' : 'HOLD_FOR_RECONCILIATION',
    blockOnlyTokens: delta.aOnly.slice(0, 30),
    candidateOnlyTokens: best.score >= 0.5 ? delta.bOnly.slice(0, 30) : [],
  };
}
