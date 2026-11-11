// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

const pageFigure = { findMany: vi.fn(), findFirst: vi.fn() };
const questionImage = { findMany: vi.fn(), findFirst: vi.fn() };
vi.mock('./prisma', () => ({ default: { pageFigure, questionImage } }));

const crop = '/api/admin/books/book-1/ingestions/run-1/question-images/pf-page-0.jpg';

describe('figure-display', () => {
  beforeEach(() => vi.clearAllMocks());

  it('serves a stored crop through /api/figures, an outside image at its own address, and drops what cannot load', async () => {
    const { parseAdminImageUrl, viewerUrlFor } = await import('./figure-display');
    expect(parseAdminImageUrl(crop)).toEqual({ bookId: 'book-1', runId: 'run-1', fileName: 'pf-page-0.jpg' });
    expect(viewerUrlFor('page', 'f1', crop)).toBe('/api/figures/page/f1');
    expect(viewerUrlFor('image', 'i1', 'https://cdn.mathpix.com/cropped/x.jpg')).toBe('https://cdn.mathpix.com/cropped/x.jpg');
    expect(viewerUrlFor('image', 'i2', '/import-images/missing.png')).toBeNull();
    expect(viewerUrlFor('image', 'i3', 'http://plain.example/x.png')).toBeNull();
  });

  it('shows reviewed crops and attached images of approved questions only, grouped by question', async () => {
    pageFigure.findMany.mockResolvedValue([
      { id: 'f1', questionId: 'q1', imageUrl: crop, reviewedAt: new Date() },
      { id: 'f2', questionId: 'q1', imageUrl: '/api/admin/books/book-1/ingestions/run-1/question-images/old-0.jpg', reviewedAt: null },
    ]);
    questionImage.findMany.mockResolvedValue([
      { id: 'i1', questionId: 'q2', imageUrl: 'https://cdn.example/a.png', caption: 'Figure 1' },
      // The same file as q1's unreviewed crop f2: hidden with it.
      { id: 'i2', questionId: 'q1', imageUrl: '/api/admin/books/book-1/ingestions/run-1/question-images/old-0.jpg', caption: null },
    ]);
    const { displayableFigures } = await import('./figure-display');
    const out = await displayableFigures(['q1', 'q2', 'q1']);
    expect(out).toEqual({ q1: [{ url: '/api/figures/page/f1', caption: null }], q2: [{ url: 'https://cdn.example/a.png', caption: 'Figure 1' }] });
    expect(pageFigure.findMany.mock.calls[0][0].where).toEqual({ question: { id: { in: ['q1', 'q2'] }, status: 'APPROVED' } });
    expect(questionImage.findMany.mock.calls[0][0].where).toEqual({ question: { id: { in: ['q1', 'q2'] }, status: 'APPROVED' } });
  });

  it('lets an admin see figures of questions not approved yet', async () => {
    pageFigure.findMany.mockResolvedValue([]);
    questionImage.findMany.mockResolvedValue([]);
    const { displayableFigures } = await import('./figure-display');
    await displayableFigures(['q1'], { includeUnapproved: true });
    expect(pageFigure.findMany.mock.calls[0][0].where.question).toEqual({ id: { in: ['q1'] } });
  });

  it('finds the file behind a served figure only under the same rule', async () => {
    pageFigure.findFirst.mockResolvedValue({ imageUrl: crop });
    const { figureFile } = await import('./figure-display');
    expect(await figureFile('page', 'f1')).toEqual({ bookId: 'book-1', runId: 'run-1', fileName: 'pf-page-0.jpg' });
    expect(pageFigure.findFirst.mock.calls[0][0].where).toEqual({ id: 'f1', reviewedAt: { not: null }, question: { status: 'APPROVED' } });
    pageFigure.findFirst.mockResolvedValue(null);
    expect(await figureFile('page', 'f2')).toBeNull();
  });

  it('does not serve an attached image that is the same file as an unreviewed crop', async () => {
    questionImage.findFirst.mockResolvedValue({ imageUrl: crop, questionId: 'q1' });
    pageFigure.findFirst.mockResolvedValue({ id: 'f-unreviewed' });
    const { figureFile } = await import('./figure-display');
    expect(await figureFile('image', 'i1')).toBeNull();
    pageFigure.findFirst.mockResolvedValue(null);
    expect(await figureFile('image', 'i1')).toEqual({ bookId: 'book-1', runId: 'run-1', fileName: 'pf-page-0.jpg' });
  });
});
