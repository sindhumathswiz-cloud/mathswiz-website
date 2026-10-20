import { compactForMatch, gramsOf } from './question-match';

/**
 * How much of an extracted question's text is actually on the page it came from: the share of the question's
 * 4-character fragments (after normalising LaTeX and spacing) found in the page text. A model asked to transcribe
 * questions sometimes rewords one, and sometimes turns theory into a question that is not printed anywhere ("Define
 * a vector..."). Both look alike by this measure, so a low share is flagged for a person to check against the page,
 * never deleted.
 */
export const SOURCE_AGREEMENT_THRESHOLD = 0.75;
export const NOT_ON_PAGE_TAG = 'Check Against Page';

export function sourceAgreement(questionText: string, pageText: string): number {
  const own = [...gramsOf(compactForMatch(questionText))];
  if (own.length === 0) return 1;
  const page = gramsOf(compactForMatch(pageText));
  return own.filter((gram) => page.has(gram)).length / own.length;
}

/** The review note for a question whose text is not clearly on its page. */
export function notOnPageNote(share: number): string {
  return `Only ${Math.round(share * 100)}% of this question's text is on its page: it may be reworded, or not a printed question at all. Check it against the page before approving.`;
}
