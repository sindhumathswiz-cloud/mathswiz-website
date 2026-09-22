export type QuestionTrustLevel = 'verified' | 'approved' | 'pending';

interface QuestionTrustInput {
  status: string;
  verificationStatus: string;
}

/**
 * Student-facing trust level for a question's solution, distinguishing a
 * human-approved-and-AI-verified answer from one that's merely approved or
 * still in the pipeline.
 *
 * Deliberately does not treat the QuestionVerificationStatus.VERIFIED enum
 * member as meaningful here -- nothing in the pipeline sets it today (it's
 * reserved for a future human-confirmation step that hasn't been designed
 * yet), so repurposing it would silently claim a meaning no one chose.
 * "verified" here means the actual AI re-derivation gate this session built:
 * MATHEMATICALLY_VERIFIED.
 */
export function deriveTrustLevel({ status, verificationStatus }: QuestionTrustInput): QuestionTrustLevel {
  if (status === 'APPROVED' && verificationStatus === 'MATHEMATICALLY_VERIFIED') return 'verified';
  if (status === 'APPROVED') return 'approved';
  return 'pending';
}
