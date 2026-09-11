import { beforeEach, describe, expect, it, vi } from 'vitest';

const getAuthenticatedUser = vi.fn();

const bookIngestionRun = { findFirst: vi.fn() };
const pageFigure = { findMany: vi.fn() };
const question = { findMany: vi.fn() };

vi.mock('@/lib/auth-server', () => ({ getAuthenticatedUser }));
vi.mock('@/lib/prisma', () => ({ default: { bookIngestionRun, pageFigure, question } }));

function get(query = '') {
  return new Request(`http://localhost/api/admin/books/book-1/ingestions/run-1/figures${query}`);
}

const params = Promise.resolve({ id: 'book-1', runId: 'run-1' });

describe('GET /api/admin/books/[id]/ingestions/[runId]/figures', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getAuthenticatedUser.mockResolvedValue({ user: { id: 'admin-1', role: 'ADMIN' } });
    bookIngestionRun.findFirst.mockResolvedValue({ id: 'run-1' });
    question.findMany.mockResolvedValue([]);
  });

  it('rejects non-admin callers', async () => {
    getAuthenticatedUser.mockResolvedValue({ error: new Response(null, { status: 403 }) });
    const { GET } = await import('./route');
    const response = (await GET(get(), { params })) as Response;
    expect(response.status).toBe(403);
  });

  it('404s when the ingestion run is not found', async () => {
    bookIngestionRun.findFirst.mockResolvedValue(null);
    const { GET } = await import('./route');
    const response = (await GET(get(), { params })) as Response;
    expect(response.status).toBe(404);
  });

  it('lists figures with question snippets, and page candidates for assigning unmatched ones', async () => {
    pageFigure.findMany.mockResolvedValue([
      { id: 'fig-1', pageNumber: 274, x: 10, y: 20, width: 100, height: 80, imageType: 'chart', imageUrl: '/img/fig-1.jpg', questionId: 'q-1', matchedAutomatically: true, reviewedAt: null, question: { id: 'q-1', printedNumber: '4', content: 'Find the area  of the ellipse', status: 'DRAFT' } },
      { id: 'fig-2', pageNumber: 274, x: 10, y: 400, width: 100, height: 80, imageType: 'chart', imageUrl: '/img/fig-2.jpg', questionId: null, matchedAutomatically: false, reviewedAt: null, question: null },
    ]);
    question.findMany.mockResolvedValue([
      { id: 'q-1', sourcePageStart: 274, printedNumber: '4', content: 'Find the area of the ellipse' },
      { id: 'q-2', sourcePageStart: 274, printedNumber: '5', content: 'Find the area under the curve' },
    ]);

    const { GET } = await import('./route');
    const data = await (await GET(get(), { params }) as Response).json();

    expect(data.figures).toHaveLength(2);
    expect(data.figures[0]).toMatchObject({ id: 'fig-1', questionId: 'q-1', question: { id: 'q-1', printedNumber: '4' } });
    expect(data.figures[1]).toMatchObject({ id: 'fig-2', questionId: null, question: null });
    expect(data.pageCandidates['274']).toEqual([
      { id: 'q-1', printedNumber: '4', content: 'Find the area of the ellipse' },
      { id: 'q-2', printedNumber: '5', content: 'Find the area under the curve' },
    ]);
    expect(question.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ bookId: 'book-1', sourcePageStart: { in: [274] }, status: { not: 'ARCHIVED' } }),
    }));
  });

  it('filters to unmatched figures and a page range when requested', async () => {
    pageFigure.findMany.mockResolvedValue([]);
    const { GET } = await import('./route');
    await GET(get('?pageStart=272&pageEnd=295&unmatchedOnly=true'), { params });

    expect(pageFigure.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { bookId: 'book-1', pageNumber: { gte: 272, lte: 295 }, questionId: null },
    }));
  });

  it('pages results with a cursor when more than the limit exist', async () => {
    pageFigure.findMany.mockResolvedValue([
      { id: 'fig-1', pageNumber: 1, x: 0, y: 0, width: 10, height: 10, imageType: 'chart', imageUrl: '/1.jpg', questionId: null, matchedAutomatically: false, reviewedAt: null, question: null },
      { id: 'fig-2', pageNumber: 1, x: 0, y: 0, width: 10, height: 10, imageType: 'chart', imageUrl: '/2.jpg', questionId: null, matchedAutomatically: false, reviewedAt: null, question: null },
    ]);
    const { GET } = await import('./route');
    const data = await (await GET(get('?limit=1'), { params }) as Response).json();

    expect(data.figures).toHaveLength(1);
    expect(data.nextCursor).toBe('fig-2');
  });
});
