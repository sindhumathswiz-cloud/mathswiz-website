import { beforeEach, describe, expect, it, vi } from 'vitest';

const getAuthenticatedUser = vi.fn();
const question = { findFirst: vi.fn(), findMany: vi.fn() };

vi.mock('@/lib/auth-server', () => ({ getAuthenticatedUser }));
vi.mock('@/lib/prisma', () => ({ default: { question } }));

const get = async (query: string) => {
  const { GET } = await import('./route');
  return (await GET(new Request(`http://localhost/api/admin/books/b1/page-questions${query}`), { params: Promise.resolve({ id: 'b1' }) })) as Response;
};

describe('GET /api/admin/books/[id]/page-questions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getAuthenticatedUser.mockResolvedValue({ user: { id: 'admin-1' } });
    question.findMany.mockResolvedValue([{ id: 'q1' }]);
  });

  it('returns what the auth check returns for anyone but an admin', async () => {
    const denied = new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403 });
    getAuthenticatedUser.mockResolvedValue({ error: denied });
    expect((await get('?from=1&to=2')).status).toBe(403);
    expect(getAuthenticatedUser).toHaveBeenCalledWith(['ADMIN']);
    expect(question.findMany).not.toHaveBeenCalled();
  });

  it('lists the questions on a page range, from this book only, never archived ones', async () => {
    const res = await get('?from=8&to=9');
    expect(res.status).toBe(200);
    expect((await res.json()).questions).toEqual([{ id: 'q1' }]);
    const where = question.findMany.mock.calls[0][0].where;
    expect(where).toMatchObject({ bookId: 'b1', status: { not: 'ARCHIVED' }, sourcePageStart: { lte: 9 } });
    // A question that runs from page 7 onto page 8 belongs to the range too; one with no end page counts by its start.
    expect(where.OR).toEqual([{ sourcePageEnd: { gte: 8 } }, { sourcePageEnd: null, sourcePageStart: { gte: 8 } }]);
  });

  it('treats a missing or too-small end as a single page, and refuses an unreadable or huge range', async () => {
    await get('?from=5');
    expect(question.findMany.mock.calls[0][0].where.sourcePageStart).toEqual({ lte: 5 });
    expect((await get('')).status).toBe(400);
    expect((await get('?from=0&to=2')).status).toBe(400);
    expect((await get('?from=abc')).status).toBe(400);
    expect((await get('?from=1&to=40')).status).toBe(400);
  });

  it('finds a question\'s own pages from its id, and refuses one from another book', async () => {
    question.findFirst.mockResolvedValue({ sourcePageStart: 12, sourcePageEnd: 13 });
    await get('?questionId=q9');
    expect(question.findFirst).toHaveBeenCalledWith({ where: { id: 'q9', bookId: 'b1' }, select: { sourcePageStart: true, sourcePageEnd: true } });
    expect(question.findMany.mock.calls[0][0].where.sourcePageStart).toEqual({ lte: 13 });
    question.findFirst.mockResolvedValue(null);
    expect((await get('?questionId=nope')).status).toBe(404);
    question.findFirst.mockResolvedValue({ sourcePageStart: null, sourcePageEnd: null });
    expect((await get('?questionId=nopage')).status).toBe(400);
  });
});
