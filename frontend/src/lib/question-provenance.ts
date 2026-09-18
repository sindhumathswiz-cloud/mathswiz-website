import type { QuestionProvenance } from '@prisma/client';

/**
 * The Question Bank acceptance gate (PHASE_QB_PILOT.md, quality gate #3):
 * "No question may be approved without its source page and printed
 * identifier." Every path that can set Question.status to APPROVED --
 * bulk creation, review-queue approval, the per-question editor, and the
 * mathematical auto-approval pass -- funnels through the two functions
 * below, so the bar can never quietly drift between them.
 *
 * MANUALLY_AUTHORED is the one explicit, auditable exemption: a question
 * that never claimed to come from a book doesn't need a source page to be
 * approved, and recording that on the row (rather than just leaving the
 * source fields empty) is what makes the exemption visible and queryable
 * instead of indistinguishable from a book-sourced question that's simply
 * missing its provenance.
 */
export interface ApprovableQuestion {
  provenance: QuestionProvenance;
  bookId: string | null;
  sourcePageStart: number | null;
  sourcePageEnd: number | null;
  printedNumber: string | null;
}

/**
 * Returns a human-readable reason the question cannot be approved yet, or
 * null if it may be. Use this where a caller wants to report the problem
 * (a 400 response, a per-item batch error) rather than throw.
 */
export function provenanceApprovalError(question: ApprovableQuestion): string | null {
  if (question.provenance === 'MANUALLY_AUTHORED') return null;

  const missing: string[] = [];
  if (!question.bookId) missing.push('bookId');
  if (question.sourcePageStart == null) missing.push('sourcePageStart');
  if (question.sourcePageEnd == null) missing.push('sourcePageEnd');
  if (!question.printedNumber) missing.push('printedNumber');
  if (missing.length === 0) return null;

  return `Book-sourced questions need a source page and printed identifier before approval (missing: ${missing.join(', ')}). If this question genuinely has no book source, mark it provenance: MANUALLY_AUTHORED instead.`;
}

/** Throws provenanceApprovalError's message if the question isn't approvable. */
export function assertApprovable(question: ApprovableQuestion): void {
  const error = provenanceApprovalError(question);
  if (error) throw new Error(error);
}

/**
 * The provenance a newly created question should carry, derived from
 * whether it's linked to a book -- every creation path should call this
 * rather than hand-picking a value, so "has a bookId" and "is BOOK_SOURCED"
 * can never drift apart at write time.
 */
export function deriveProvenance(bookId: string | null | undefined): QuestionProvenance {
  return bookId ? 'BOOK_SOURCED' : 'MANUALLY_AUTHORED';
}
