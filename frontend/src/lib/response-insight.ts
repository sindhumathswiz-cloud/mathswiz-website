export type ErrorType = 'SKIPPED' | 'CARELESS' | 'NEEDS_REVIEW' | 'COMMON_MISTAKE';
export type ConfidenceLevel = 'HIGH' | 'MEDIUM' | 'LOW';

// Same overtime/too-fast thresholds the performance route already uses for
// its behavioral stats (stats.overtime/wasted/tooFast) -- reused here rather
// than introducing a second set of cutoffs for the same signal.
const OVERTIME_MULTIPLIER = 1.5;
const TOO_FAST_MULTIPLIER = 0.5;

// A wrong pick this common across the student body isn't this student being
// careless -- it means the question/material itself is commonly
// misunderstood. Starting point, not derived from existing data; tune after
// seeing real distributions.
export const COMMON_MISTAKE_MIN_COUNT = 3;

export interface ErrorClassificationInput {
  isCorrect: boolean;
  isSkipped: boolean;
  timeSpent: number;
  medianTime: number;
  isCommonMistake: boolean;
}

/**
 * Deterministic heuristic, not an LLM classification: skipped beats
 * common-mistake beats a time-based split of the remaining wrong answers.
 * Returns null for a correct answer -- there's no error to classify.
 */
export function classifyErrorType(input: ErrorClassificationInput): ErrorType | null {
  if (input.isCorrect) return null;
  if (input.isSkipped) return 'SKIPPED';
  if (input.isCommonMistake) return 'COMMON_MISTAKE';
  if (input.timeSpent < input.medianTime * TOO_FAST_MULTIPLIER) return 'CARELESS';
  return 'NEEDS_REVIEW';
}

export interface ConfidenceInput {
  wasMarkedForReview: boolean;
  timeSpent: number;
  medianTime: number;
}

/**
 * Derived purely from behavior (no self-reported field): a student who
 * flagged the question for review, or took much longer than their own
 * median, was unsure regardless of whether the answer ended up correct.
 * A much-faster-than-median answer reads as a guess, not confidence.
 */
export function deriveConfidence(input: ConfidenceInput): ConfidenceLevel {
  if (input.wasMarkedForReview || input.timeSpent > input.medianTime * OVERTIME_MULTIPLIER) return 'LOW';
  if (input.timeSpent < input.medianTime * TOO_FAST_MULTIPLIER) return 'MEDIUM';
  return 'HIGH';
}
