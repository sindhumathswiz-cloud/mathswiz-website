import { describe, expect, it } from 'vitest';
import { mistakesFromCards, isDueForReview } from './mistake-queue';

describe('mistakesFromCards', () => {
  it('maps lapses to missCount and dueAt straight through', () => {
    const now = new Date('2026-01-10T00:00:00Z');
    const cards = [{ questionId: 'q1', lapses: 3, lastReviewedAt: now, createdAt: now, dueAt: now }];
    const result = mistakesFromCards(cards);
    expect(result).toEqual([{ questionId: 'q1', missCount: 3, lastMissedAt: now, dueAt: now }]);
  });

  it('falls back lastMissedAt to createdAt when a card has never been reviewed', () => {
    const created = new Date('2026-01-01T00:00:00Z');
    const cards = [{ questionId: 'q1', lapses: 1, lastReviewedAt: null, createdAt: created, dueAt: created }];
    expect(mistakesFromCards(cards)[0].lastMissedAt).toEqual(created);
  });

  it('sorts oldest-review-first', () => {
    const now = new Date('2026-01-10T00:00:00Z');
    const older = new Date('2026-01-01T00:00:00Z');
    const cards = [
      { questionId: 'recent', lapses: 1, lastReviewedAt: now, createdAt: now, dueAt: now },
      { questionId: 'old', lapses: 1, lastReviewedAt: older, createdAt: older, dueAt: older },
    ];
    expect(mistakesFromCards(cards).map((r) => r.questionId)).toEqual(['old', 'recent']);
  });

  it('returns an empty array for no cards', () => {
    expect(mistakesFromCards([])).toEqual([]);
  });
});

describe('isDueForReview', () => {
  it('is false before dueAt', () => {
    const now = new Date('2026-01-10T00:00:00Z');
    const entry = { questionId: 'q1', missCount: 1, lastMissedAt: now, dueAt: new Date(now.getTime() + 60_000) };
    expect(isDueForReview(entry, now)).toBe(false);
  });

  it('is true once dueAt has passed', () => {
    const now = new Date('2026-01-10T00:00:00Z');
    const entry = { questionId: 'q1', missCount: 1, lastMissedAt: now, dueAt: new Date(now.getTime() - 60_000) };
    expect(isDueForReview(entry, now)).toBe(true);
  });
});
