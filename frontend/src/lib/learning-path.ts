export type LearningPathStage = 'EXAMPLES' | 'GUIDED_PRACTICE' | 'TIMED_QUIZ' | 'RECOVERY_PRACTICE' | 'COMPLETED';

// Tunable thresholds for the stage-gating state machine. Not confirmed
// pedagogy -- placeholder defaults the user (or a curriculum stakeholder)
// may want to tune later; kept in one place rather than inlined across
// routes so that's a one-line change when they do.
export const EXAMPLES_REQUIRED = 3;
export const GUIDED_MIN_ATTEMPTS = 5;
export const GUIDED_ACCURACY_THRESHOLD = 0.7;

/** Clamps the examples-required threshold to however many actually exist for a sparse topic. */
export function examplesRequiredFor(availableExamplesCount: number): number {
  return Math.max(1, Math.min(EXAMPLES_REQUIRED, availableExamplesCount));
}

export interface ExamplesProgress {
  examplesViewedCount: number;
  availableExamplesCount: number;
}

export interface GuidedProgress {
  guidedAttempted: number;
  guidedCorrect: number;
}

/**
 * Pure gate-transition logic for the learning-path state machine, called
 * from every stage-specific route so the rule lives in one tested place.
 * Transitions are always server-computed from persisted counters -- never
 * client-set.
 */
export function nextStageAfterExamplesView(current: LearningPathStage, progress: ExamplesProgress): LearningPathStage {
  if (current !== 'EXAMPLES') return current;
  const required = examplesRequiredFor(progress.availableExamplesCount);
  return progress.examplesViewedCount >= required ? 'GUIDED_PRACTICE' : 'EXAMPLES';
}

export function nextStageAfterGuidedRecord(current: LearningPathStage, progress: GuidedProgress): LearningPathStage {
  if (current !== 'GUIDED_PRACTICE') return current;
  if (progress.guidedAttempted < GUIDED_MIN_ATTEMPTS) return 'GUIDED_PRACTICE';
  const accuracy = progress.guidedAttempted > 0 ? progress.guidedCorrect / progress.guidedAttempted : 0;
  return accuracy >= GUIDED_ACCURACY_THRESHOLD ? 'TIMED_QUIZ' : 'GUIDED_PRACTICE';
}

export function nextStageAfterQuizComplete(current: LearningPathStage, missCount: number): LearningPathStage {
  if (current !== 'TIMED_QUIZ') return current;
  return missCount > 0 ? 'RECOVERY_PRACTICE' : 'COMPLETED';
}

export function nextStageAfterRecoveryCheck(current: LearningPathStage, remainingMistakes: number): LearningPathStage {
  if (current !== 'RECOVERY_PRACTICE') return current;
  return remainingMistakes === 0 ? 'COMPLETED' : 'RECOVERY_PRACTICE';
}

/** Stage ordering, used to guard against a client calling a later-stage route before reaching it. */
const STAGE_ORDER: LearningPathStage[] = ['EXAMPLES', 'GUIDED_PRACTICE', 'TIMED_QUIZ', 'RECOVERY_PRACTICE', 'COMPLETED'];

export function hasReachedStage(current: LearningPathStage, required: LearningPathStage): boolean {
  return STAGE_ORDER.indexOf(current) >= STAGE_ORDER.indexOf(required);
}
