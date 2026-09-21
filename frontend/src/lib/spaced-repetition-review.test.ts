import { describe, expect, it, vi } from 'vitest';
import { recordQuestionReview, getQuestionTimeBaseline } from './spaced-repetition-review';

function makeClient(existing: { easinessFactor: number; intervalDays: number; repetitions: number; lapses: number } | null) {
  return {
    spacedRepetitionCard: {
      findUnique: vi.fn().mockResolvedValue(existing),
      upsert: vi.fn().mockResolvedValue({}),
    },
  };
}

describe('recordQuestionReview', () => {
  it('does not create a card for a correct answer with no existing card', async () => {
    const client = makeClient(null);
    const result = await recordQuestionReview(client, {
      userId: 'student-1', questionId: 'q1', signal: { isCorrect: true, timeSpent: 30, medianTime: 30 },
    });
    expect(result).toBeNull();
    expect(client.spacedRepetitionCard.upsert).not.toHaveBeenCalled();
  });

  it('creates a card on a first miss, with a lapse recorded', async () => {
    const client = makeClient(null);
    await recordQuestionReview(client, {
      userId: 'student-1', questionId: 'q1', signal: { isCorrect: false, timeSpent: 30, medianTime: 30 },
    });
    expect(client.spacedRepetitionCard.upsert).toHaveBeenCalledWith(expect.objectContaining({
      where: { userId_questionId: { userId: 'student-1', questionId: 'q1' } },
      create: expect.objectContaining({ lapses: 1, repetitions: 0, intervalDays: 1 }),
    }));
  });

  it('updates an existing card on a later correct review, without resetting it (real SM-2, not the old vanish-on-correct behavior)', async () => {
    const client = makeClient({ easinessFactor: 2.3, intervalDays: 6, repetitions: 2, lapses: 2 });
    await recordQuestionReview(client, {
      userId: 'student-1', questionId: 'q1', signal: { isCorrect: true, timeSpent: 30, medianTime: 30 },
    });
    expect(client.spacedRepetitionCard.upsert).toHaveBeenCalledWith(expect.objectContaining({
      update: expect.objectContaining({ repetitions: 3, lapses: 2 }),
    }));
  });

  it('increments lapses (not resets) on a repeat miss against an existing card', async () => {
    const client = makeClient({ easinessFactor: 2.3, intervalDays: 6, repetitions: 2, lapses: 2 });
    await recordQuestionReview(client, {
      userId: 'student-1', questionId: 'q1', signal: { isCorrect: false, timeSpent: 30, medianTime: 30 },
    });
    expect(client.spacedRepetitionCard.upsert).toHaveBeenCalledWith(expect.objectContaining({
      update: expect.objectContaining({ repetitions: 0, lapses: 3, intervalDays: 1 }),
    }));
  });
});

describe('getQuestionTimeBaseline', () => {
  it('falls back to the flat default under 3 samples', async () => {
    const client = { testResponse: { findMany: vi.fn().mockResolvedValue([{ timeSpent: 10 }, { timeSpent: 20 }]) } };
    expect(await getQuestionTimeBaseline(client, 'q1')).toBe(45);
  });

  it('computes the median of at least 3 samples', async () => {
    const client = { testResponse: { findMany: vi.fn().mockResolvedValue([{ timeSpent: 10 }, { timeSpent: 50 }, { timeSpent: 30 }]) } };
    expect(await getQuestionTimeBaseline(client, 'q1')).toBe(30);
  });

  it('excludes skipped responses via the query filter', async () => {
    const findMany = vi.fn().mockResolvedValue([]);
    await getQuestionTimeBaseline({ testResponse: { findMany } }, 'q1');
    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { questionId: 'q1', status: { not: 'SKIPPED' } },
    }));
  });
});
