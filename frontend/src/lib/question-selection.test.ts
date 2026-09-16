import { beforeEach, describe, expect, it, vi } from 'vitest';

const findMany = vi.fn();

vi.mock('@/lib/prisma', () => ({ default: { question: { findMany } } }));

describe('selectQuestionsByFilters', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    findMany.mockResolvedValue([]);
  });

  it('builds a where clause per filter and defaults count to 5', async () => {
    const { selectQuestionsByFilters } = await import('./question-selection');
    await selectQuestionsByFilters([{ topic: 'Algebra' }]);
    expect(findMany).toHaveBeenCalledWith({
      where: { status: 'APPROVED', topic: { contains: 'Algebra', mode: 'insensitive' } },
      take: 5,
    });
  });

  it('includes difficulty, type, and bookChapterId when provided', async () => {
    const { selectQuestionsByFilters } = await import('./question-selection');
    await selectQuestionsByFilters([{ difficulty: 'HARD', type: 'SINGLE_CHOICE', bookChapterId: 'ch-1', count: 10 }]);
    expect(findMany).toHaveBeenCalledWith({
      where: { status: 'APPROVED', difficulty: 'HARD', type: 'SINGLE_CHOICE', bookChapterId: 'ch-1' },
      take: 10,
    });
  });

  it('concatenates results across multiple filters', async () => {
    findMany
      .mockResolvedValueOnce([{ id: 'q-1' }, { id: 'q-2' }])
      .mockResolvedValueOnce([{ id: 'q-3' }]);
    const { selectQuestionsByFilters } = await import('./question-selection');
    const result = await selectQuestionsByFilters([{ topic: 'Algebra', count: 2 }, { topic: 'Geometry', count: 1 }]);
    expect(result).toEqual([{ id: 'q-1' }, { id: 'q-2' }, { id: 'q-3' }]);
    expect(findMany).toHaveBeenCalledTimes(2);
  });
});

describe('masteryToDifficultyBand', () => {
  it('returns EASY only below 25', async () => {
    const { masteryToDifficultyBand } = await import('./question-selection');
    expect(masteryToDifficultyBand(0)).toEqual(['EASY']);
    expect(masteryToDifficultyBand(24)).toEqual(['EASY']);
  });

  it('returns EASY+MEDIUM between 25 and 54', async () => {
    const { masteryToDifficultyBand } = await import('./question-selection');
    expect(masteryToDifficultyBand(25)).toEqual(['EASY', 'MEDIUM']);
    expect(masteryToDifficultyBand(54)).toEqual(['EASY', 'MEDIUM']);
  });

  it('returns MEDIUM+HARD at 55 and above', async () => {
    const { masteryToDifficultyBand } = await import('./question-selection');
    expect(masteryToDifficultyBand(55)).toEqual(['MEDIUM', 'HARD']);
    expect(masteryToDifficultyBand(100)).toEqual(['MEDIUM', 'HARD']);
  });
});
