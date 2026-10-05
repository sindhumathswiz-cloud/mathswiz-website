import { answerKeySectionForPage, isLikelyAnswerKeyPage, isLikelyDetailedSolutionsPage, solutionsSectionForPage, type ConfirmedChapter } from './book-manifest';

/**
 * Pages that must never be read for revision content: answer keys and worked
 * solutions. Their text is copied from the book exactly, so the verbatim check
 * cannot tell it apart from a formula sheet -- a numbered list of final answers
 * ("12. pi/2 log(1/2)") would come out as "formulas". Exclusion has to happen
 * before the model sees the page.
 *
 * Two independent signals, either of which is enough:
 *  - the confirmed chapter manifest says the page is in an answer-key or
 *    detailed-solutions range (authoritative when the chapter is confirmed);
 *  - the page itself opens with an Answers / Solutions / Hints heading, or has
 *    the shape of an answer key or a run of worked solutions (for chapters whose
 *    manifest is not confirmed yet).
 */

// A heading on the page's first line: "Answers", "Answer Key", "Solutions",
// "Detailed Solutions of ...", "Hints and Solutions".
const LISTING_HEADING_RE = /^(?:#+\s*)?(?:detailed\s+)?(?:answers?(?:\s+key)?|solutions?|hints?)(?:\s+(?:and|&)\s+(?:answers?|solutions?|hints?))?\b[^\n]{0,60}$/i;

export function whyNotReferencePage(page: { pageNumber: number; text: string }, confirmed: ConfirmedChapter[]): string | null {
  if (answerKeySectionForPage(confirmed, page.pageNumber)) return 'answer key (confirmed manifest)';
  if (solutionsSectionForPage(confirmed, page.pageNumber)) return 'worked solutions (confirmed manifest)';
  const firstLine = page.text.trimStart().split('\n', 1)[0].trim();
  if (LISTING_HEADING_RE.test(firstLine)) return `starts with the heading "${firstLine.slice(0, 40)}"`;
  if (isLikelyAnswerKeyPage(page.text)) return 'has the shape of an answer key';
  if (isLikelyDetailedSolutionsPage(page.text)) return 'has the shape of worked solutions';
  return null;
}

export function splitReferencePages<T extends { pageNumber: number; text: string }>(pages: T[], confirmed: ConfirmedChapter[]): { reference: T[]; skipped: Array<{ pageNumber: number; reason: string }> } {
  const reference: T[] = [];
  const skipped: Array<{ pageNumber: number; reason: string }> = [];
  for (const page of pages) {
    const reason = whyNotReferencePage(page, confirmed);
    if (reason) skipped.push({ pageNumber: page.pageNumber, reason });
    else reference.push(page);
  }
  return { reference, skipped };
}
