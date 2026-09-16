import { describe, expect, it } from 'vitest';
import {
  examplesRequiredFor,
  hasReachedStage,
  nextStageAfterExamplesView,
  nextStageAfterGuidedRecord,
  nextStageAfterQuizComplete,
  nextStageAfterRecoveryCheck,
} from './learning-path';

describe('examplesRequiredFor', () => {
  it('defaults to 3 when plenty of examples exist', () => {
    expect(examplesRequiredFor(10)).toBe(3);
  });
  it('clamps down to however many exist for a sparse topic', () => {
    expect(examplesRequiredFor(1)).toBe(1);
    expect(examplesRequiredFor(2)).toBe(2);
  });
  it('never returns less than 1', () => {
    expect(examplesRequiredFor(0)).toBe(1);
  });
});

describe('nextStageAfterExamplesView', () => {
  it('stays in EXAMPLES below the threshold', () => {
    expect(nextStageAfterExamplesView('EXAMPLES', { examplesViewedCount: 2, availableExamplesCount: 5 })).toBe('EXAMPLES');
  });
  it('advances to GUIDED_PRACTICE once the threshold is hit', () => {
    expect(nextStageAfterExamplesView('EXAMPLES', { examplesViewedCount: 3, availableExamplesCount: 5 })).toBe('GUIDED_PRACTICE');
  });
  it('respects the clamped threshold for a sparse topic', () => {
    expect(nextStageAfterExamplesView('EXAMPLES', { examplesViewedCount: 1, availableExamplesCount: 1 })).toBe('GUIDED_PRACTICE');
  });
  it('is a no-op once already past EXAMPLES', () => {
    expect(nextStageAfterExamplesView('GUIDED_PRACTICE', { examplesViewedCount: 3, availableExamplesCount: 5 })).toBe('GUIDED_PRACTICE');
  });
});

describe('nextStageAfterGuidedRecord', () => {
  it('stays in GUIDED_PRACTICE under the minimum attempts even at 100% accuracy', () => {
    expect(nextStageAfterGuidedRecord('GUIDED_PRACTICE', { guidedAttempted: 4, guidedCorrect: 4 })).toBe('GUIDED_PRACTICE');
  });
  it('stays in GUIDED_PRACTICE at enough attempts but below the accuracy threshold', () => {
    expect(nextStageAfterGuidedRecord('GUIDED_PRACTICE', { guidedAttempted: 5, guidedCorrect: 3 })).toBe('GUIDED_PRACTICE');
  });
  it('advances to TIMED_QUIZ once both conditions hold', () => {
    expect(nextStageAfterGuidedRecord('GUIDED_PRACTICE', { guidedAttempted: 5, guidedCorrect: 4 })).toBe('TIMED_QUIZ');
  });
  it('is exact at the threshold boundary (0.7 accuracy)', () => {
    expect(nextStageAfterGuidedRecord('GUIDED_PRACTICE', { guidedAttempted: 10, guidedCorrect: 7 })).toBe('TIMED_QUIZ');
  });
});

describe('nextStageAfterQuizComplete', () => {
  it('goes to RECOVERY_PRACTICE when there were misses', () => {
    expect(nextStageAfterQuizComplete('TIMED_QUIZ', 2)).toBe('RECOVERY_PRACTICE');
  });
  it('goes straight to COMPLETED with zero misses', () => {
    expect(nextStageAfterQuizComplete('TIMED_QUIZ', 0)).toBe('COMPLETED');
  });
});

describe('nextStageAfterRecoveryCheck', () => {
  it('stays in RECOVERY_PRACTICE while mistakes remain', () => {
    expect(nextStageAfterRecoveryCheck('RECOVERY_PRACTICE', 1)).toBe('RECOVERY_PRACTICE');
  });
  it('completes once all recovery mistakes are cleared', () => {
    expect(nextStageAfterRecoveryCheck('RECOVERY_PRACTICE', 0)).toBe('COMPLETED');
  });
});

describe('hasReachedStage', () => {
  it('true when current stage is at or past the required stage', () => {
    expect(hasReachedStage('TIMED_QUIZ', 'GUIDED_PRACTICE')).toBe(true);
    expect(hasReachedStage('GUIDED_PRACTICE', 'GUIDED_PRACTICE')).toBe(true);
  });
  it('false when current stage has not reached the required stage', () => {
    expect(hasReachedStage('EXAMPLES', 'TIMED_QUIZ')).toBe(false);
  });
});
