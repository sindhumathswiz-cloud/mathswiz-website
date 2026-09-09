import { describe, expect, it } from 'vitest';
import { computeMistakeQueue, isDueForReview } from './mistake-queue';

const hoursAgo = (h: number, now: Date) => new Date(now.getTime() - h * 60 * 60 * 1000);

describe('computeMistakeQueue', () => {
  it('excludes questions whose most recent attempt was correct', () => {
    const now = new Date('2026-01-10T00:00:00Z');
    const events = [
      { questionId: 'q1', isCorrect: false, createdAt: hoursAgo(48, now) },
      { questionId: 'q1', isCorrect: true, createdAt: hoursAgo(1, now) },
    ];
    expect(computeMistakeQueue(events, now)).toEqual([]);
  });

  it('includes a question whose most recent attempt was incorrect, with a miss count', () => {
    const now = new Date('2026-01-10T00:00:00Z');
    const events = [
      { questionId: 'q1', isCorrect: true, createdAt: hoursAgo(200, now) },
      { questionId: 'q1', isCorrect: false, createdAt: hoursAgo(48, now) },
      { questionId: 'q1', isCorrect: false, createdAt: hoursAgo(1, now) },
    ];
    const result = computeMistakeQueue(events, now);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ questionId: 'q1', missCount: 2 });
  });

  it('ignores events with no questionId', () => {
    const now = new Date('2026-01-10T00:00:00Z');
    const events = [{ questionId: null, isCorrect: false, createdAt: now }];
    expect(computeMistakeQueue(events, now)).toEqual([]);
  });

  it('sorts oldest-missed-first', () => {
    const now = new Date('2026-01-10T00:00:00Z');
    const events = [
      { questionId: 'recent', isCorrect: false, createdAt: hoursAgo(1, now) },
      { questionId: 'old', isCorrect: false, createdAt: hoursAgo(100, now) },
    ];
    const result = computeMistakeQueue(events, now);
    expect(result.map(r => r.questionId)).toEqual(['old', 'recent']);
  });

  it('backs off further out the more times a question is missed in a row', () => {
    const now = new Date('2026-01-10T00:00:00Z');
    const oneMiss = computeMistakeQueue(
      [{ questionId: 'q1', isCorrect: false, createdAt: hoursAgo(2, now) }],
      now,
    )[0];
    const threeMisses = computeMistakeQueue(
      [
        { questionId: 'q2', isCorrect: false, createdAt: hoursAgo(6, now) },
        { questionId: 'q2', isCorrect: false, createdAt: hoursAgo(4, now) },
        { questionId: 'q2', isCorrect: false, createdAt: hoursAgo(2, now) },
      ],
      now,
    )[0];

    // A single miss 2 hours ago (4h interval) isn't due yet; a third
    // consecutive miss on the same question resurfaces sooner relative to
    // its own last-miss time isn't the point here — the point is the
    // interval itself grows with missCount.
    expect(threeMisses.dueAt.getTime() - threeMisses.lastMissedAt.getTime())
      .toBeGreaterThan(oneMiss.dueAt.getTime() - oneMiss.lastMissedAt.getTime());
  });
});

describe('isDueForReview', () => {
  it('is false before the interval has elapsed', () => {
    const now = new Date('2026-01-10T00:00:00Z');
    const [entry] = computeMistakeQueue(
      [{ questionId: 'q1', isCorrect: false, createdAt: hoursAgo(1, now) }],
      now,
    );
    expect(isDueForReview(entry, now)).toBe(false);
  });

  it('is true once the interval has elapsed', () => {
    const now = new Date('2026-01-10T00:00:00Z');
    const [entry] = computeMistakeQueue(
      [{ questionId: 'q1', isCorrect: false, createdAt: hoursAgo(200, now) }],
      now,
    );
    expect(isDueForReview(entry, now)).toBe(true);
  });
});
