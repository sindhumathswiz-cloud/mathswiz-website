import type { CanonicalQuestion } from './extract-normalizer';
import type { QAIssue } from './question-qa';

/**
 * Detects a book page whose structured output looks INCOMPLETE for reasons
 * other than the case-study passage/sub-question split that
 * case-study-fragment.ts already handles — specifically:
 *
 *  1. Structuring found NOTHING on a page with real text. Previously this
 *     text was just discarded (saved to DocumentPage.rawText but never fed
 *     into a Question) on the assumption it was pure page furniture. In
 *     practice it's frequently the tail end of a worked solution that has no
 *     "Q." marker of its own to anchor a new question, or a question stem
 *     whose printed number/body is split awkwardly by the page image crop —
 *     either way, silently dropping it loses real content.
 *
 *  2. Exactly one question was found and its content/explanation has an
 *     UNBALANCED_MATH QA issue — an odd number of `$` delimiters is a
 *     strong, deterministic signal that a LaTeX expression was literally
 *     cut off mid-block by the page boundary, not that the source text is
 *     actually malformed.
 *
 * Root cause this addresses: extraction runs one rendered page at a time
 * (see extract-questions/route.ts). Answer/explanation text that spills onto
 * the next printed page previously only got reunited with its question when
 * the page also matched the CASE_STUDY_INTRO_RE pattern in
 * case-study-fragment.ts — an ordinary Short/Long Answer derivation that ran
 * long had no such mechanism and was saved as a truncated, "cut off
 * mid-derivation" DRAFT question instead. This function feeds the SAME
 * PendingCaseStudyFragment stitching mechanism in extract-questions/route.ts,
 * just with a broader (non-case-study) trigger condition.
 *
 * Deliberately conservative: the multi-question case (a page with several
 * questions where only the LAST one is incomplete) isn't covered here — a
 * whole page can only be held as one pending blob by the existing mechanism,
 * so holding a multi-question page would also re-queue its already-complete
 * questions. That's an accepted gap; MAX_FRAGMENT_CHAIN_PAGES in the caller
 * bounds the cost of any false positive from this function to at most a few
 * pages' worth of extra prompt text, never data corruption.
 */

// Below this many characters, a "found nothing" page is more likely OCR
// noise (a stray page number, a blank/near-blank scanned page) than a real
// continuation worth holding for the next page.
const MIN_HOLD_TEXT_CHARS = 20;

export interface StructuredForIncompleteCheck {
  question: CanonicalQuestion;
  qaIssues: QAIssue[];
}

export function isLikelyIncompletePage(rawText: string, structured: StructuredForIncompleteCheck[]): boolean {
  const trimmed = (rawText || '').trim();
  if (!trimmed) return false;

  if (structured.length === 0) {
    return trimmed.length >= MIN_HOLD_TEXT_CHARS;
  }

  if (structured.length === 1) {
    return structured[0].qaIssues.some((issue) => issue.code === 'UNBALANCED_MATH');
  }

  return false;
}
