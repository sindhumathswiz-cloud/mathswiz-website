/**
 * Finding the same question twice, even when one copy was typed or OCR'd a little differently
 * (spacing, a "[CBSE 2014]" tag, a leading number). Used to recover answers and solutions from a
 * copy that came out of a printed book.
 */

/** The question stem as a bare string of letters, digits and math symbols: no spacing, tags or numbering. */
export function compactForMatch(text: string): string {
  return (text ?? '')
    .toLowerCase()
    .replace(/\[[^\]]{0,60}\]/g, ' ')
    .replace(/^\s*(?:q\.?\s*)?\d{1,3}\s*[.)]\s+/, '')
    .replace(/\\(?:left|right|,|;|:|!|quad|qquad|displaystyle|boldsymbol|mathrm|text|operatorname)/g, '')
    .replace(/\\([a-z]+)/g, '$1')
    .replace(/[^a-z0-9+\-*/=^<>]/g, '');
}

/** Character 4-grams of the compact form. */
export function gramsOf(compact: string, n = 4): Set<string> {
  const grams = new Set<string>();
  for (let i = 0; i + n <= compact.length; i++) grams.add(compact.slice(i, i + n));
  return grams;
}

/** Sørensen–Dice similarity of two gram sets, 0 to 1. */
export function dice(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let shared = 0;
  const [small, large] = a.size <= b.size ? [a, b] : [b, a];
  for (const gram of small) if (large.has(gram)) shared++;
  return (2 * shared) / (a.size + b.size);
}

export interface Matchable { id: string; compact: string; grams: Set<string> }

export function toMatchable(id: string, content: string): Matchable {
  const compact = compactForMatch(content);
  return { id, compact, grams: gramsOf(compact) };
}

/** An index over a pool, so each lookup compares only the few entries that share rare grams. */
export class MatchIndex {
  private byGram = new Map<string, number[]>();
  constructor(private pool: Matchable[]) {
    pool.forEach((entry, index) => {
      for (const gram of entry.grams) {
        const list = this.byGram.get(gram);
        if (list) list.push(index); else this.byGram.set(gram, [index]);
      }
    });
  }

  /** The best match at or above `threshold`, ignoring `selfId`; null when none. */
  best(query: Matchable, threshold: number, selfId?: string): { entry: Matchable; score: number } | null {
    if (query.compact.length < 20) return null; // too short to say two questions are the same one
    const votes = new Map<number, number>();
    for (const gram of query.grams) {
      const list = this.byGram.get(gram);
      if (!list || list.length > 400) continue; // very common grams say little
      for (const index of list) votes.set(index, (votes.get(index) ?? 0) + 1);
    }
    let best: { entry: Matchable; score: number } | null = null;
    const candidates = [...votes.entries()].sort((x, y) => y[1] - x[1]).slice(0, 8);
    for (const [index] of candidates) {
      const entry = this.pool[index];
      if (entry.id === selfId) continue;
      const ratio = entry.compact.length / query.compact.length;
      if (ratio < 0.75 || ratio > 1.34) continue;
      const score = dice(query.grams, entry.grams);
      if (score >= threshold && (!best || score > best.score)) best = { entry, score };
    }
    return best;
  }
}

/** The numbers in a question stem, sorted, with thousands separators and source tags ignored. */
export function numbersIn(text: string): string[] {
  return ((text ?? '')
    .replace(/\[[^\]]{0,60}\]/g, ' ')
    .replace(/^\s*(?:q\.?\s*)?\d{1,3}\s*[.)]\s+/, '')
    .replace(/(?<=\d),(?=\d{3}(?!\d))/g, '')
    .match(/\d+(?:\.\d+)?/g) ?? []).sort();
}

/**
 * Two stems that read alike but carry different numbers are different questions ("P(A)=0.4" and
 * "P(A)=0.5" differ by one character and score almost 1 on text similarity), so a match also needs this.
 */
export const sameNumbers = (a: string, b: string): boolean => {
  const x = numbersIn(a);
  const y = numbersIn(b);
  return x.length === y.length && x.every((value, i) => value === y[i]);
};
