import { beforeEach, describe, expect, it, vi } from 'vitest';

const getAuthenticatedUser = vi.fn();
const recordAuditLog = vi.fn();

const bookIngestionRun = { findFirst: vi.fn() };
const pageFigure = { findFirst: vi.fn(), update: vi.fn() };
const question = { findFirst: vi.fn() };

vi.mock('@/lib/auth-server', () => ({ getAuthenticatedUser }));
vi.mock('@/lib/prisma', () => ({ default: { bookIngestionRun, pageFigure, question } }));
vi.mock('@/lib/audit-log', () => ({ recordAuditLog, requestAuditContext: () => ({}) }));

function patch(body: unknown) {
  return new Request('http://localhost/api/admin/books/book-1/ingestions/run-1/figures/fig-1', {
    method: 'PATCH',
    body: JSON.stringify(body),
  });
}

const params = Promise.resolve({ id: 'book-1', runId: 'run-1', figureId: 'fig-1' });

describe('PATCH /api/admin/books/[id]/ingestions/[runId]/figures/[figureId]', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getAuthenticatedUser.mockResolvedValue({ user: { id: 'admin-1', role: 'ADMIN' } });
    bookIngestionRun.findFirst.mockResolvedValue({ id: 'run-1' });
    pageFigure.findFirst.mockResolvedValue({ id: 'fig-1', questionId: null, pageNumber: 274 });
    pageFigure.update.mockImplementation(async ({ data }) => ({ id: 'fig-1', ...data }));
  });

  it('rejects non-admin callers', async () => {
    getAuthenticatedUser.mockResolvedValue({ error: new Response(null, { status: 403 }) });
    const { PATCH } = await import('./route');
    const response = (await PATCH(patch({ questionId: 'q-1' }), { params })) as Response;
    expect(response.status).toBe(403);
  });

  it('404s when the figure does not belong to this book', async () => {
    pageFigure.findFirst.mockResolvedValue(null);
    const { PATCH } = await import('./route');
    const response = (await PATCH(patch({ questionId: 'q-1' }), { params })) as Response;
    expect(response.status).toBe(404);
  });

  it('400s when the body has neither questionId nor reviewed', async () => {
    const { PATCH } = await import('./route');
    const response = (await PATCH(patch({}), { params })) as Response;
    expect(response.status).toBe(400);
  });

  it('rejects a questionId belonging to a different book', async () => {
    question.findFirst.mockResolvedValue(null);
    const { PATCH } = await import('./route');
    const response = (await PATCH(patch({ questionId: 'q-other-book' }), { params })) as Response;
    expect(response.status).toBe(400);
    expect(pageFigure.update).not.toHaveBeenCalled();
  });

  it('assigns a figure to a question in this book, marks it manual, and audits', async () => {
    question.findFirst.mockResolvedValue({ id: 'q-1' });
    const { PATCH } = await import('./route');
    const response = (await PATCH(patch({ questionId: 'q-1' }), { params })) as Response;
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(pageFigure.update).toHaveBeenCalledWith({
      where: { id: 'fig-1' },
      data: { questionId: 'q-1', matchedAutomatically: false, reviewedAt: expect.any(Date), reviewedById: 'admin-1' },
      select: { id: true, questionId: true, matchedAutomatically: true, reviewedAt: true },
    });
    expect(data.figure.questionId).toBe('q-1');
    expect(recordAuditLog).toHaveBeenCalledWith(expect.objectContaining({
      action: 'BOOK_FIGURE_ASSIGNED',
      metadata: expect.objectContaining({ bookId: 'book-1', questionId: 'q-1' }),
    }));
  });

  it('unassigns a figure with questionId: null', async () => {
    pageFigure.findFirst.mockResolvedValue({ id: 'fig-1', questionId: 'q-old', pageNumber: 274 });
    const { PATCH } = await import('./route');
    await PATCH(patch({ questionId: null }), { params });

    expect(question.findFirst).not.toHaveBeenCalled();
    expect(pageFigure.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ questionId: null }),
    }));
  });

  it('marks a figure reviewed without touching its assignment', async () => {
    const { PATCH } = await import('./route');
    await PATCH(patch({ reviewed: true }), { params });

    expect(pageFigure.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ questionId: null, reviewedAt: expect.any(Date) }),
    }));
  });
});
