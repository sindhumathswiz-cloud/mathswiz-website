/**
 * The exam clock, decided on the server. The browser shows a countdown, but it
 * cannot be the authority: a closed tab paused it, and nothing stopped an answer
 * arriving long after time was up.
 *
 * The clock starts when the student presses "Start Examination" (not when the
 * page loads, so reading the instructions is free), and a submit that arrives
 * after the deadline plus a short grace period is scored from the last answers
 * saved before that moment, not from whatever the request now claims.
 */

/** Covers network delay and a slow phone at the very end; the browser submits at zero. */
export const SUBMIT_GRACE_SECONDS = 90;

export interface ClockAttempt {
  startTime: Date | string;
  examStartedAt?: Date | string | null;
}

const ms = (value: Date | string) => new Date(value).getTime();

/** When the clock started: the explicit start press, else (older attempts) when the attempt was created. */
export function clockStartOf(attempt: ClockAttempt): number {
  return ms(attempt.examStartedAt ?? attempt.startTime);
}

export function deadlineOf(attempt: ClockAttempt, durationMinutes: number): number {
  return clockStartOf(attempt) + durationMinutes * 60_000;
}

/** Whole seconds left, never negative. */
export function secondsRemaining(attempt: ClockAttempt, durationMinutes: number, now: Date | number = Date.now()): number {
  const remaining = Math.ceil((deadlineOf(attempt, durationMinutes) - (typeof now === 'number' ? now : now.getTime())) / 1000);
  return Math.max(0, remaining);
}

/** True once even the grace period has run out: answers sent now are no longer accepted as-is. */
export function isPastGrace(attempt: ClockAttempt, durationMinutes: number, now: Date | number = Date.now()): boolean {
  return (typeof now === 'number' ? now : now.getTime()) > deadlineOf(attempt, durationMinutes) + SUBMIT_GRACE_SECONDS * 1000;
}

/**
 * The answers to score. On time: what the request carries. Late: the last
 * server-side save, which can only contain answers sent while the clock ran.
 */
export function answersToScore<T>(args: { pastGrace: boolean; submitted: T | undefined | null; saved: T | undefined | null }): { responses: T | Record<string, never>; usedSavedCopy: boolean } {
  if (!args.pastGrace) return { responses: (args.submitted ?? {}) as T, usedSavedCopy: false };
  return { responses: (args.saved ?? {}) as T, usedSavedCopy: true };
}
