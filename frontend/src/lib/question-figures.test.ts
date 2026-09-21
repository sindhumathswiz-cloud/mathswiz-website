import { beforeEach, describe, expect, it, vi } from 'vitest';

const pageFigure = { findMany: vi.fn() };
vi.mock('./prisma', () => ({ default: { pageFigure } }));

const baseQuestion = {
  id: 'q-1',
  bookId: 'book-1',
  content: 'What is 2 + 2?',
  explanation: 'Basic addition.',
  sourcePageStart: 10,
  sourcePageEnd: 10,
};

describe('contentReferencesFigure', () => {
  it('detects common figure/diagram trigger words', async () => {
    const { contentReferencesFigure } = await import('./question-figures');
    expect(contentReferencesFigure('Refer to the figure below.')).toBe(true);
    expect(contentReferencesFigure('In the diagram shown, find x.')).toBe(true);
    expect(contentReferencesFigure('For the given matrix A, find |A|.')).toBe(true);
    expect(contentReferencesFigure('What is 2 + 2?')).toBe(false);
    expect(contentReferencesFigure(null)).toBe(false);
    expect(contentReferencesFigure(undefined)).toBe(false);
  });
});

describe('figureApprovalError', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('passes a question with no book/page range without querying (MANUALLY_AUTHORED-shaped)', async () => {
    const { figureApprovalError } = await import('./question-figures');
    const error = await figureApprovalError({ ...baseQuestion, bookId: null, sourcePageStart: null, sourcePageEnd: null });
    expect(error).toBeNull();
    expect(pageFigure.findMany).not.toHaveBeenCalled();
  });

  it('passes a question that does not reference a figure and has no unresolved figures on its page', async () => {
    pageFigure.findMany.mockResolvedValueOnce([]).mockResolvedValueOnce([]);
    const { figureApprovalError } = await import('./question-figures');
    const error = await figureApprovalError(baseQuestion);
    expect(error).toBeNull();
  });

  it('blocks a figure-referencing question with no retained figure asset', async () => {
    pageFigure.findMany.mockResolvedValueOnce([]).mockResolvedValueOnce([]);
    const { figureApprovalError } = await import('./question-figures');
    const error = await figureApprovalError({ ...baseQuestion, content: 'Study the diagram below and find x.' });
    expect(error).toContain('no retained figure asset');
  });

  it('blocks a figure-referencing question whose linked figure was only auto-matched, never reviewed', async () => {
    pageFigure.findMany
      .mockResolvedValueOnce([{ id: 'f-1', reviewedAt: null, matchedAutomatically: true }])
      .mockResolvedValueOnce([]);
    const { figureApprovalError } = await import('./question-figures');
    const error = await figureApprovalError({ ...baseQuestion, content: 'Study the diagram below and find x.' });
    expect(error).toContain('only auto-matched');
    expect(error).toContain('not completed visual review');
  });

  it('blocks a figure-referencing question whose linked figure was manually assigned but never marked reviewed', async () => {
    pageFigure.findMany
      .mockResolvedValueOnce([{ id: 'f-1', reviewedAt: null, matchedAutomatically: false }])
      .mockResolvedValueOnce([]);
    const { figureApprovalError } = await import('./question-figures');
    const error = await figureApprovalError({ ...baseQuestion, content: 'Study the diagram below and find x.' });
    expect(error).toContain('not completed visual review');
    expect(error).not.toContain('only auto-matched');
  });

  it('allows a figure-referencing question whose linked figure has completed review', async () => {
    pageFigure.findMany
      .mockResolvedValueOnce([{ id: 'f-1', reviewedAt: new Date(), matchedAutomatically: true }])
      .mockResolvedValueOnce([]);
    const { figureApprovalError } = await import('./question-figures');
    const error = await figureApprovalError({ ...baseQuestion, content: 'Study the diagram below and find x.' });
    expect(error).toBeNull();
  });

  it('treats a question with an already-linked figure as figure-requiring even without trigger words in its text', async () => {
    pageFigure.findMany
      .mockResolvedValueOnce([{ id: 'f-1', reviewedAt: null, matchedAutomatically: true }])
      .mockResolvedValueOnce([]);
    const { figureApprovalError } = await import('./question-figures');
    const error = await figureApprovalError(baseQuestion); // plain "What is 2 + 2?" content
    expect(error).toContain('not completed visual review');
  });

  it('blocks approval when an unrelated unmatched, unreviewed figure sits on the same source page', async () => {
    pageFigure.findMany
      .mockResolvedValueOnce([]) // no figures linked to this question
      .mockResolvedValueOnce([{ id: 'f-2', pageNumber: 10 }]); // stray unresolved figure on the page
    const { figureApprovalError } = await import('./question-figures');
    const error = await figureApprovalError(baseQuestion); // content doesn't reference a figure itself
    expect(error).toContain('unmatched figure');
    expect(error).toContain('10');
  });

  it('allows approval once the stray figure on the page has been reviewed (matched elsewhere or dismissed)', async () => {
    pageFigure.findMany.mockResolvedValueOnce([]).mockResolvedValueOnce([]);
    const { figureApprovalError } = await import('./question-figures');
    const error = await figureApprovalError(baseQuestion);
    expect(error).toBeNull();
  });

  it('queries unresolved figures across the full sourcePageStart..sourcePageEnd range', async () => {
    pageFigure.findMany.mockResolvedValueOnce([]).mockResolvedValueOnce([]);
    const { figureApprovalError } = await import('./question-figures');
    await figureApprovalError({ ...baseQuestion, sourcePageStart: 10, sourcePageEnd: 12 });
    expect(pageFigure.findMany).toHaveBeenNthCalledWith(2, expect.objectContaining({
      where: expect.objectContaining({ bookId: 'book-1', pageNumber: { gte: 10, lte: 12 }, questionId: null, reviewedAt: null }),
    }));
  });
});
