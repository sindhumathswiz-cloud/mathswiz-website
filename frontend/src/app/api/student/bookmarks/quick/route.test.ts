import { beforeEach, describe, expect, it, vi } from 'vitest';

const getServerSession = vi.fn();
const bookmarkList = { findUnique: vi.fn(), create: vi.fn() };
const bookmarkItem = { upsert: vi.fn() };
const question = { findFirst: vi.fn() };

vi.mock('next-auth', () => ({ getServerSession }));
vi.mock('@/lib/auth', () => ({ authOptions: {} }));
vi.mock('@/lib/prisma', () => ({ default: { bookmarkList, bookmarkItem, question } }));

function post(body: unknown) {
  return new Request('http://localhost/api/student/bookmarks/quick', { method: 'POST', body: JSON.stringify(body) });
}

describe('POST /api/student/bookmarks/quick', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getServerSession.mockResolvedValue({ user: { id: 'student-1', role: 'STUDENT' } });
    question.findFirst.mockResolvedValue({ id: 'q-1' });
    bookmarkItem.upsert.mockResolvedValue({ id: 'item-1' });
  });

  it('rejects non-student roles', async () => {
    getServerSession.mockResolvedValue({ user: { id: 'teacher-1', role: 'TEACHER' } });
    const { POST } = await import('./route');
    const response = await POST(post({ questionId: 'q-1' }));
    expect(response.status).toBe(401);
  });

  it('creates the default list on first use', async () => {
    bookmarkList.findUnique.mockResolvedValue(null);
    bookmarkList.create.mockResolvedValue({ id: 'list-1', userId: 'student-1', name: 'My Bookmarks' });
    const { POST } = await import('./route');
    const response = await POST(post({ questionId: 'q-1' }));
    expect(response.status).toBe(200);
    expect(bookmarkList.create).toHaveBeenCalledTimes(1);
  });

  it('reuses the existing default list on a second call', async () => {
    bookmarkList.findUnique.mockResolvedValue({ id: 'list-1', userId: 'student-1', name: 'My Bookmarks' });
    const { POST } = await import('./route');
    await POST(post({ questionId: 'q-1' }));
    await POST(post({ questionId: 'q-2' }));
    expect(bookmarkList.create).not.toHaveBeenCalled();
    expect(bookmarkItem.upsert).toHaveBeenCalledTimes(2);
  });

  it('404s for a non-visible question', async () => {
    question.findFirst.mockResolvedValue(null);
    const { POST } = await import('./route');
    const response = await POST(post({ questionId: 'q-missing' }));
    expect(response.status).toBe(404);
  });
});
