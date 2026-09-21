import { describe, expect, it } from 'vitest';
import { classifyErrorType, deriveConfidence } from './response-insight';

describe('classifyErrorType', () => {
  it('returns null for a correct answer regardless of timing', () => {
    expect(classifyErrorType({ isCorrect: true, isSkipped: false, timeSpent: 999, medianTime: 30, isCommonMistake: false })).toBeNull();
  });

  it('classifies a skipped question as SKIPPED even if it would otherwise be a common mistake', () => {
    expect(classifyErrorType({ isCorrect: false, isSkipped: true, timeSpent: 0, medianTime: 30, isCommonMistake: true })).toBe('SKIPPED');
  });

  it('classifies a common wrong pick as COMMON_MISTAKE ahead of the time-based split', () => {
    expect(classifyErrorType({ isCorrect: false, isSkipped: false, timeSpent: 5, medianTime: 30, isCommonMistake: true })).toBe('COMMON_MISTAKE');
  });

  it('classifies a fast wrong answer (not a common mistake) as CARELESS', () => {
    expect(classifyErrorType({ isCorrect: false, isSkipped: false, timeSpent: 10, medianTime: 30, isCommonMistake: false })).toBe('CARELESS');
  });

  it('classifies a slow or normal-paced wrong answer as NEEDS_REVIEW', () => {
    expect(classifyErrorType({ isCorrect: false, isSkipped: false, timeSpent: 50, medianTime: 30, isCommonMistake: false })).toBe('NEEDS_REVIEW');
    expect(classifyErrorType({ isCorrect: false, isSkipped: false, timeSpent: 30, medianTime: 30, isCommonMistake: false })).toBe('NEEDS_REVIEW');
  });
});

describe('deriveConfidence', () => {
  it('is LOW when the response was marked for review, regardless of timing', () => {
    expect(deriveConfidence({ wasMarkedForReview: true, timeSpent: 30, medianTime: 30 })).toBe('LOW');
  });

  it('is LOW when time spent is well above the median (marked or not)', () => {
    expect(deriveConfidence({ wasMarkedForReview: false, timeSpent: 100, medianTime: 30 })).toBe('LOW');
  });

  it('is MEDIUM when time spent is well below the median (guess-speed) and not marked', () => {
    expect(deriveConfidence({ wasMarkedForReview: false, timeSpent: 5, medianTime: 30 })).toBe('MEDIUM');
  });

  it('is HIGH for an unmarked, roughly-median-time response', () => {
    expect(deriveConfidence({ wasMarkedForReview: false, timeSpent: 30, medianTime: 30 })).toBe('HIGH');
  });
});
