import { describe, expect, it } from 'vitest';
import { SUBMIT_GRACE_SECONDS, answersToScore, clockStartOf, deadlineOf, isPastGrace, secondsRemaining } from './exam-clock';

const T0 = new Date('2026-10-06T10:00:00Z');
const at = (seconds: number) => new Date(T0.getTime() + seconds * 1000);

describe('exam clock', () => {
  it('starts at the explicit start press, falling back to attempt creation for older attempts', () => {
    expect(clockStartOf({ startTime: T0, examStartedAt: at(120) })).toBe(at(120).getTime());
    expect(clockStartOf({ startTime: T0, examStartedAt: null })).toBe(T0.getTime());
    expect(clockStartOf({ startTime: T0.toISOString() })).toBe(T0.getTime());
  });

  it('counts down from the start press, so time spent on the instructions page is free', () => {
    const attempt = { startTime: T0, examStartedAt: at(300) };
    expect(secondsRemaining(attempt, 60, at(300))).toBe(3600);
    expect(secondsRemaining(attempt, 60, at(300 + 600))).toBe(3000);
    expect(deadlineOf(attempt, 60)).toBe(at(300 + 3600).getTime());
  });

  it('never goes negative and rounds a part second up', () => {
    const attempt = { startTime: T0, examStartedAt: T0 };
    expect(secondsRemaining(attempt, 1, at(61))).toBe(0);
    expect(secondsRemaining(attempt, 1, new Date(T0.getTime() + 59_500))).toBe(1);
  });

  it('allows a short grace period after the deadline, then no more', () => {
    const attempt = { startTime: T0, examStartedAt: T0 };
    const deadline = 60 * 60;
    expect(isPastGrace(attempt, 60, at(deadline))).toBe(false);
    expect(isPastGrace(attempt, 60, at(deadline + SUBMIT_GRACE_SECONDS))).toBe(false);
    expect(isPastGrace(attempt, 60, at(deadline + SUBMIT_GRACE_SECONDS + 1))).toBe(true);
  });

  it('scores the request on time, and the last saved copy once the grace has passed', () => {
    const submitted = { q1: { selectedOption: 'A' } };
    const saved = { q1: { selectedOption: 'B' } };
    expect(answersToScore({ pastGrace: false, submitted, saved })).toEqual({ responses: submitted, usedSavedCopy: false });
    expect(answersToScore({ pastGrace: true, submitted, saved })).toEqual({ responses: saved, usedSavedCopy: true });
    expect(answersToScore({ pastGrace: true, submitted, saved: null })).toEqual({ responses: {}, usedSavedCopy: true });
    expect(answersToScore({ pastGrace: false, submitted: undefined, saved })).toEqual({ responses: {}, usedSavedCopy: false });
  });
});
