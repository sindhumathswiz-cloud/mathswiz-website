import { beforeEach, describe, expect, it, vi } from 'vitest';

const pageFigure = { findMany: vi.fn() };
vi.mock('./prisma', () => ({ default: { pageFigure } }));

const cleanMcq = {
  id: 'q-1',
  content: 'What is 2 + 2?',
  options: ['2', '3', '4', '5'],
  correctAnswer: 'C',
  explanation: 'Basic addition.',
  type: 'SINGLE_CHOICE',
  provenance: 'BOOK_SOURCED' as const,
  bookId: 'book-1',
  sourcePageStart: 10,
  sourcePageEnd: 10,
  printedNumber: '3',
  confidence: 90,
};

describe('assessQuestionsRisk', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    pageFigure.findMany.mockResolvedValue([]);
  });

  it('returns an empty map for an empty input without querying', async () => {
    const { assessQuestionsRisk } = await import('./question-risk');
    const result = await assessQuestionsRisk([]);
    expect(result.size).toBe(0);
    expect(pageFigure.findMany).not.toHaveBeenCalled();
  });

  it('scores a clean question at its own confidence, with no blockers', async () => {
    const { assessQuestionsRisk } = await import('./question-risk');
    const result = await assessQuestionsRisk([cleanMcq]);
    expect(result.get('q-1')).toEqual({ score: 90, blockers: [] });
  });

  it('defaults score to 50 for a clean question with no confidence recorded', async () => {
    const { assessQuestionsRisk } = await import('./question-risk');
    const result = await assessQuestionsRisk([{ ...cleanMcq, confidence: null }]);
    expect(result.get('q-1')?.score).toBe(50);
  });

  it('flags a provenance blocker for a BOOK_SOURCED question missing its printed number', async () => {
    const { assessQuestionsRisk } = await import('./question-risk');
    const result = await assessQuestionsRisk([{ ...cleanMcq, printedNumber: null }]);
    const risk = result.get('q-1')!;
    expect(risk.blockers).toHaveLength(1);
    expect(risk.blockers[0]).toContain('printedNumber');
    expect(risk.score).toBe(30); // BASE_BLOCKED_SCORE, one blocker
  });

  it('flags a structural blocker for duplicate options', async () => {
    const { assessQuestionsRisk } = await import('./question-risk');
    const result = await assessQuestionsRisk([{ ...cleanMcq, options: ['4', '4', '5', '6'] }]);
    expect(result.get('q-1')!.blockers[0]).toContain('DUPLICATE_OPTIONS');
  });

  it('flags a figure blocker for a figure-referencing question with no retained asset', async () => {
    const { assessQuestionsRisk } = await import('./question-risk');
    const result = await assessQuestionsRisk([{ ...cleanMcq, content: 'Study the diagram below and find x.' }]);
    expect(result.get('q-1')!.blockers[0]).toContain('figure asset');
  });

  it('lowers the score further for each additional blocker, most-blocked first when sorted', async () => {
    const { assessQuestionsRisk } = await import('./question-risk');
    const oneBlocker = { ...cleanMcq, id: 'q-1', printedNumber: null };
    const twoBlockers = { ...cleanMcq, id: 'q-2', printedNumber: null, options: ['4', '4', '5', '6'] };
    const result = await assessQuestionsRisk([oneBlocker, twoBlockers]);
    expect(result.get('q-1')!.score).toBeGreaterThan(result.get('q-2')!.score);
  });

  it('never scores below zero regardless of how many blockers stack up', async () => {
    const { assessQuestionsRisk } = await import('./question-risk');
    const manyBlockers = { ...cleanMcq, printedNumber: null, bookId: null, options: ['4', '4'], correctAnswer: 'Z' };
    const result = await assessQuestionsRisk([manyBlockers]);
    expect(result.get('q-1')!.score).toBeGreaterThanOrEqual(0);
  });

  it('batches figure lookups into two queries total regardless of pool size', async () => {
    const { assessQuestionsRisk } = await import('./question-risk');
    const pool = Array.from({ length: 20 }, (_, i) => ({ ...cleanMcq, id: `q-${i}` }));
    await assessQuestionsRisk(pool);
    expect(pageFigure.findMany).toHaveBeenCalledTimes(2);
  });

  it('scopes the linked-figure query to exactly the candidate ids, and the unresolved query to their unique bookIds', async () => {
    const { assessQuestionsRisk } = await import('./question-risk');
    await assessQuestionsRisk([
      { ...cleanMcq, id: 'q-1', bookId: 'book-1' },
      { ...cleanMcq, id: 'q-2', bookId: 'book-1' },
      { ...cleanMcq, id: 'q-3', bookId: 'book-2' },
    ]);
    expect(pageFigure.findMany).toHaveBeenNthCalledWith(1, expect.objectContaining({
      where: expect.objectContaining({ questionId: { in: ['q-1', 'q-2', 'q-3'] } }),
    }));
    expect(pageFigure.findMany).toHaveBeenNthCalledWith(2, expect.objectContaining({
      where: expect.objectContaining({ bookId: { in: ['book-1', 'book-2'] } }),
    }));
  });

  it('treats a question with an already-linked, reviewed figure as clean even without figure-referencing text', async () => {
    pageFigure.findMany.mockImplementation(({ where }: any) =>
      Promise.resolve('questionId' in where ? [{ questionId: 'q-1', reviewedAt: new Date(), matchedAutomatically: false }] : []));
    const { assessQuestionsRisk } = await import('./question-risk');
    const result = await assessQuestionsRisk([cleanMcq]);
    expect(result.get('q-1')!.blockers).toEqual([]);
  });

  it('flags a question whose page has an unresolved unmatched figure, even with no figure-referencing text of its own', async () => {
    pageFigure.findMany.mockImplementation(({ where }: any) =>
      Promise.resolve('bookId' in where ? [{ bookId: 'book-1', pageNumber: 10 }] : []));
    const { assessQuestionsRisk } = await import('./question-risk');
    const result = await assessQuestionsRisk([cleanMcq]);
    expect(result.get('q-1')!.blockers[0]).toContain('unmatched figure');
  });

  it('does not run the figure gate for a MANUALLY_AUTHORED question with no book', async () => {
    const { assessQuestionsRisk } = await import('./question-risk');
    const result = await assessQuestionsRisk([{ ...cleanMcq, provenance: 'MANUALLY_AUTHORED', bookId: null, sourcePageStart: null, sourcePageEnd: null }]);
    expect(result.get('q-1')!.blockers).toEqual([]);
  });
});
