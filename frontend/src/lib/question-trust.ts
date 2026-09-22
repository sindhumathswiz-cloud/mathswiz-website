export type QuestionTrustLevel = 'verified' | 'approved' | 'pending';

interface QuestionTrustInput {
  status: string;
  verificationStatus: string;
}

/**
 * Student-facing trust level for a question's solution, distinguishing a
 * verified answer (confirmed either by this app's AI re-derivation pass or
 * by an admin's explicit human review) from one that's merely approved or
 * still in the pipeline.
 *
 * Two distinct signals both count as "verified":
 * - MATHEMATICALLY_VERIFIED: this app's own AI re-derivation gate
 *   (api/admin/books/[id]/verify-mathematics/route.ts) independently
 *   re-solved the question and confirmed it matches the stored answer.
 * - VERIFIED: an admin explicitly clicked "Mark resolved" on a flagged
 *   review-queue row (api/admin/questions/[id]/resolve-flag/route.ts) --
 *   a genuine human confirmation, at least as trustworthy as the automated
 *   pass. (An earlier version of this comment claimed nothing sets this
 *   enum member; that was wrong -- resolve-flag has set it since Phase 5.)
 */
export function deriveTrustLevel({ status, verificationStatus }: QuestionTrustInput): QuestionTrustLevel {
  if (status === 'APPROVED' && (verificationStatus === 'MATHEMATICALLY_VERIFIED' || verificationStatus === 'VERIFIED')) return 'verified';
  if (status === 'APPROVED') return 'approved';
  return 'pending';
}
