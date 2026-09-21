import { describe, expect, it } from 'vitest';
import { computeNextReview, deriveQuestionReviewQuality, DEFAULT_SM2_STATE, GRADE_QUALITY } from './spaced-repetition';

const DAY = 24 * 60 * 60 * 1000;

describe('computeNextReview', () => {
  it('follows the classic 1 / 6 / interval*EF progression on consecutive passes', () => {
    const now = new Date('2026-01-01T00:00:00Z');
    const first = computeNextReview(DEFAULT_SM2_STATE, 4, now);
    expect(first.repetitions).toBe(1);
    expect(first.intervalDays).toBe(1);
    expect(first.dueAt.getTime() - now.getTime()).toBe(1 * DAY);

    const second = computeNextReview(first, 4, now);
    expect(second.repetitions).toBe(2);
    expect(second.intervalDays).toBe(6);

    const third = computeNextReview(second, 4, now);
    expect(third.repetitions).toBe(3);
    expect(third.intervalDays).toBe(Math.round(second.intervalDays * third.easinessFactor));
  });

  it('resets interval to 1 day and repetitions to 0 on a fail, but still updates the easiness factor', () => {
    const now = new Date('2026-01-01T00:00:00Z');
    const passed = computeNextReview(computeNextReview(DEFAULT_SM2_STATE, 4, now), 4, now);
    const failed = computeNextReview(passed, 1, now);
    expect(failed.repetitions).toBe(0);
    expect(failed.intervalDays).toBe(1);
    expect(failed.easinessFactor).not.toBe(passed.easinessFactor);
  });

  it('floors the easiness factor at 1.3 even under repeated fails', () => {
    const now = new Date('2026-01-01T00:00:00Z');
    let state = DEFAULT_SM2_STATE;
    for (let i = 0; i < 20; i++) state = computeNextReview(state, 0, now);
    expect(state.easinessFactor).toBeGreaterThanOrEqual(1.3);
  });

  it('a higher quality grade yields a larger easiness factor than a lower one from the same state', () => {
    const now = new Date('2026-01-01T00:00:00Z');
    const easy = computeNextReview(DEFAULT_SM2_STATE, 5, now);
    const hard = computeNextReview(DEFAULT_SM2_STATE, 3, now);
    expect(easy.easinessFactor).toBeGreaterThan(hard.easinessFactor);
  });

  it('maps GRADE_QUALITY buttons to the documented SM-2 quality values', () => {
    expect(GRADE_QUALITY).toEqual({ AGAIN: 0, HARD: 3, GOOD: 4, EASY: 5 });
  });
});

describe('deriveQuestionReviewQuality', () => {
  it('is always 0 for an incorrect answer, regardless of timing', () => {
    expect(deriveQuestionReviewQuality({ isCorrect: false, timeSpent: 5, medianTime: 30 })).toBe(0);
    expect(deriveQuestionReviewQuality({ isCorrect: false, timeSpent: 500, medianTime: 30 })).toBe(0);
  });

  it('is 5 for a correct, roughly-median-time (high confidence) answer', () => {
    expect(deriveQuestionReviewQuality({ isCorrect: true, timeSpent: 30, medianTime: 30 })).toBe(5);
  });

  it('is 4 for a correct, much-faster-than-median (medium confidence / guess-speed) answer', () => {
    expect(deriveQuestionReviewQuality({ isCorrect: true, timeSpent: 5, medianTime: 30 })).toBe(4);
  });

  it('is 3 for a correct but marked-for-review (low confidence) answer, never a fail', () => {
    expect(deriveQuestionReviewQuality({ isCorrect: true, timeSpent: 30, medianTime: 30, wasMarkedForReview: true })).toBe(3);
  });

  it('is 3 for a correct but much-slower-than-median (low confidence) answer', () => {
    expect(deriveQuestionReviewQuality({ isCorrect: true, timeSpent: 100, medianTime: 30 })).toBe(3);
  });
});
