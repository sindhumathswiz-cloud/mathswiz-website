import { beforeEach, describe, expect, it, vi } from 'vitest';

const question = { findMany: vi.fn() };
const bookExercise = { update: vi.fn() };
vi.mock('./prisma', () => ({ default: { question, bookExercise } }));

const loadConfirmedChapters = vi.fn();
vi.mock('./book-manifest', async () => {
  const actual = await vi.importActual<typeof import('./book-manifest')>('./book-manifest');
  return { ...actual, loadConfirmedChapters };
});

const baseSection = {
  id: 'ex-1', code: '3.2', title: 'Exercise 3.2', sectionType: 'MCQ', startPage: 40, endPage: 45,
  inlineAnswers: false, noAnswers: false,
  answerKeyStartPage: null, answerKeyEndPage: null, answerKeyCoverage: null,
  solutionsStartPage: null, solutionsEndPage: null, solutionCoverage: null,
  expectedQuestionCount: 10, extractedQuestionCount: 0, matchedQuestionCount: 0, unresolvedQuestionCount: 0, reconciledAt: null,
};

const chapter = (exercises: any[]) => ({
  id: 'ch-1', name: 'Vector Algebra', topic: 'Vector Algebra', startPage: 30, endPage: 60,
  manifestConfirmedAt: new Date(), exercises,
});

describe('exerciseDiscrepancies', () => {
  it('is clean when unresolved is zero and extracted meets or exceeds expected', async () => {
    const { exerciseDiscrepancies } = await import('./exercise-reconciliation');
    expect(exerciseDiscrepancies({ expectedQuestionCount: 10, extractedQuestionCount: 10, unresolvedQuestionCount: 0 })).toEqual([]);
    expect(exerciseDiscrepancies({ expectedQuestionCount: 10, extractedQuestionCount: 12, unresolvedQuestionCount: 0 })).toEqual([]);
  });

  it('flags unresolved questions regardless of expected count', async () => {
    const { exerciseDiscrepancies } = await import('./exercise-reconciliation');
    const reasons = exerciseDiscrepancies({ expectedQuestionCount: null, extractedQuestionCount: 5, unresolvedQuestionCount: 2 });
    expect(reasons).toEqual(['2 extracted question(s) still missing an answer or solution']);
  });

  it('flags an extracted count short of expected', async () => {
    const { exerciseDiscrepancies } = await import('./exercise-reconciliation');
    const reasons = exerciseDiscrepancies({ expectedQuestionCount: 10, extractedQuestionCount: 7, unresolvedQuestionCount: 0 });
    expect(reasons).toEqual(['expected 10 question(s), only 7 extracted']);
  });

  it('does not flag a short extracted count when expected was never set', async () => {
    const { exerciseDiscrepancies } = await import('./exercise-reconciliation');
    expect(exerciseDiscrepancies({ expectedQuestionCount: null, extractedQuestionCount: 3, unresolvedQuestionCount: 0 })).toEqual([]);
  });

  it('reports both reasons at once when both are true', async () => {
    const { exerciseDiscrepancies } = await import('./exercise-reconciliation');
    const reasons = exerciseDiscrepancies({ expectedQuestionCount: 10, extractedQuestionCount: 6, unresolvedQuestionCount: 2 });
    expect(reasons).toHaveLength(2);
  });
});

describe('reconcileExercise', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('counts objective questions as matched only when they have a correctAnswer', async () => {
    question.findMany.mockResolvedValue([
      { type: 'SINGLE_CHOICE', correctAnswer: 'B', explanation: null },
      { type: 'SINGLE_CHOICE', correctAnswer: '', explanation: 'has explanation but not an answer' },
      { type: 'MULTIPLE_CHOICE', correctAnswer: null, explanation: null },
    ]);
    const { reconcileExercise } = await import('./exercise-reconciliation');
    const result = await reconcileExercise('book-1', { id: 'ex-1', startPage: 40, endPage: 45 });

    expect(result).toMatchObject({ extractedQuestionCount: 3, matchedQuestionCount: 1, unresolvedQuestionCount: 2 });
    expect(bookExercise.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'ex-1' },
      data: expect.objectContaining({ extractedQuestionCount: 3, matchedQuestionCount: 1, unresolvedQuestionCount: 2 }),
    }));
  });

  it('counts subjective questions as matched only when they have an explanation', async () => {
    question.findMany.mockResolvedValue([
      { type: 'LONG_ANSWER', correctAnswer: null, explanation: 'A full worked solution.' },
      { type: 'SUBJECTIVE', correctAnswer: null, explanation: '' },
    ]);
    const { reconcileExercise } = await import('./exercise-reconciliation');
    const result = await reconcileExercise('book-1', { id: 'ex-2', startPage: 40, endPage: 45 });

    expect(result).toMatchObject({ extractedQuestionCount: 2, matchedQuestionCount: 1, unresolvedQuestionCount: 1 });
  });

  it('scopes the question query to the exercise page range and excludes ARCHIVED rows', async () => {
    question.findMany.mockResolvedValue([]);
    const { reconcileExercise } = await import('./exercise-reconciliation');
    await reconcileExercise('book-1', { id: 'ex-1', startPage: 40, endPage: 45 });

    expect(question.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ bookId: 'book-1', status: { not: 'ARCHIVED' }, sourcePageStart: { gte: 40, lte: 45 } }),
    }));
  });

  it('is a zeroed no-op when the exercise has no confirmed page range, without querying questions', async () => {
    const { reconcileExercise } = await import('./exercise-reconciliation');
    const result = await reconcileExercise('book-1', { id: 'ex-1', startPage: null, endPage: null });

    expect(result).toMatchObject({ extractedQuestionCount: 0, matchedQuestionCount: 0, unresolvedQuestionCount: 0 });
    expect(question.findMany).not.toHaveBeenCalled();
    expect(bookExercise.update).toHaveBeenCalled();
  });
});

describe('reconcileBook / bookReconciliationReport', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('skips non-question-bearing (THEORY) sections', async () => {
    loadConfirmedChapters.mockResolvedValue([chapter([
      { ...baseSection, id: 'ex-theory', sectionType: 'THEORY' },
      { ...baseSection, id: 'ex-mcq', sectionType: 'MCQ' },
    ])]);
    question.findMany.mockResolvedValue([]);
    const { reconcileBook } = await import('./exercise-reconciliation');
    const rows = await reconcileBook('book-1');

    expect(rows).toHaveLength(1);
    expect(rows[0].exerciseId).toBe('ex-mcq');
  });

  it('reconcileBook recomputes and returns fresh discrepancies', async () => {
    loadConfirmedChapters.mockResolvedValue([chapter([{ ...baseSection }])]);
    question.findMany.mockResolvedValue([{ type: 'SINGLE_CHOICE', correctAnswer: null, explanation: null }]);
    const { reconcileBook } = await import('./exercise-reconciliation');
    const rows = await reconcileBook('book-1');

    expect(rows[0].extractedQuestionCount).toBe(1);
    expect(rows[0].unresolvedQuestionCount).toBe(1);
    expect(rows[0].discrepancies).toEqual(expect.arrayContaining([
      expect.stringContaining('missing an answer or solution'),
      expect.stringContaining('expected 10'),
    ]));
  });

  it('bookReconciliationReport reads stored values without recomputing', async () => {
    loadConfirmedChapters.mockResolvedValue([chapter([{
      ...baseSection, extractedQuestionCount: 10, matchedQuestionCount: 10, unresolvedQuestionCount: 0, reconciledAt: new Date('2026-09-01'),
    }])]);
    const { bookReconciliationReport } = await import('./exercise-reconciliation');
    const rows = await bookReconciliationReport('book-1');

    expect(question.findMany).not.toHaveBeenCalled();
    expect(bookExercise.update).not.toHaveBeenCalled();
    expect(rows[0]).toMatchObject({ extractedQuestionCount: 10, matchedQuestionCount: 10, unresolvedQuestionCount: 0, discrepancies: [] });
  });
});
