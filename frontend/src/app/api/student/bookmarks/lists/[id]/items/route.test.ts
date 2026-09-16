import { beforeEach, describe, expect, it, vi } from 'vitest';

const getServerSession = vi.fn();
const bookmarkList = { findUnique: vi.fn(), update: vi.fn() };
const bookmarkItem = { findMany: vi.fn(), upsert: vi.fn() };
const question = { findFirst: vi.fn() };

vi.mock('next-auth', () => ({ getServerSession }));
vi.mock('@/lib/auth', () => ({ authOptions: {} }));
vi.mock('@/lib/prisma', () => ({ default: { bookmarkList, bookmarkItem, question } }));

const params = (id: string) => Promise.resolve({ id });
function post(id: string, body: unknown) {
  return { req: new Request(`http://localhost/api/student/bookmarks/lists/${id}/items`, { method: 'POST', body: JSON.stringify(body) }), params: params(id) };
}

describe('POST /api/student/bookmarks/lists/[id]/items', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getServerSession.mockResolvedValue({ user: { id: 'student-1', role: 'STUDENT' } });
    bookmarkList.update.mockResolvedValue({});
  });

  it('404s if the list is not owned by the caller', async () => {
    bookmarkList.findUnique.mockResolvedValue({ id: 'list-1', userId: 'other-student' });
    const { POST } = await import('./route');
    const { req, params: p } = post('list-1', { questionId: 'q-1' });
    const response = await POST(req, { params: p });
    expect(response.status).toBe(404);
  });

  it('404s for a non-visible question', async () => {
    bookmarkList.findUnique.mockResolvedValue({ id: 'list-1', userId: 'student-1' });
    question.findFirst.mockResolvedValue(null);
    const { POST } = await import('./route');
    const { req, params: p } = post('list-1', { questionId: 'q-draft' });
    const response = await POST(req, { params: p });
    expect(response.status).toBe(404);
    expect(bookmarkItem.upsert).not.toHaveBeenCalled();
  });

  it('adds a valid question to an owned list', async () => {
    bookmarkList.findUnique.mockResolvedValue({ id: 'list-1', userId: 'student-1' });
    question.findFirst.mockResolvedValue({ id: 'q-1' });
    bookmarkItem.upsert.mockResolvedValue({ id: 'item-1', listId: 'list-1', questionId: 'q-1' });
    const { POST } = await import('./route');
    const { req, params: p } = post('list-1', { questionId: 'q-1' });
    const response = await POST(req, { params: p });
    expect(response.status).toBe(200);
  });
});
