import { beforeEach, describe, expect, it, vi } from 'vitest';

const getServerSession = vi.fn();
const bookmarkList = { findMany: vi.fn(), create: vi.fn() };

vi.mock('next-auth', () => ({ getServerSession }));
vi.mock('@/lib/auth', () => ({ authOptions: {} }));
vi.mock('@/lib/prisma', () => ({ default: { bookmarkList } }));

function post(body: unknown) {
  return new Request('http://localhost/api/student/bookmarks/lists', { method: 'POST', body: JSON.stringify(body) });
}

describe('GET /api/student/bookmarks/lists', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getServerSession.mockResolvedValue({ user: { id: 'student-1', role: 'STUDENT' } });
  });

  it('rejects non-student roles', async () => {
    getServerSession.mockResolvedValue({ user: { id: 'teacher-1', role: 'TEACHER' } });
    const { GET } = await import('./route');
    const response = await GET();
    expect(response.status).toBe(401);
  });

  it('scopes lists to the caller only', async () => {
    bookmarkList.findMany.mockResolvedValue([{ id: 'list-1', userId: 'student-1', name: 'My Bookmarks' }]);
    const { GET } = await import('./route');
    await GET();
    expect(bookmarkList.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { userId: 'student-1' } }));
  });
});

describe('POST /api/student/bookmarks/lists', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getServerSession.mockResolvedValue({ user: { id: 'student-1', role: 'STUDENT' } });
  });

  it('rejects an empty name', async () => {
    const { POST } = await import('./route');
    const response = await POST(post({ name: '  ' }));
    expect(response.status).toBe(400);
  });

  it('creates a list', async () => {
    bookmarkList.create.mockResolvedValue({ id: 'list-1', userId: 'student-1', name: 'Weak spots' });
    const { POST } = await import('./route');
    const response = await POST(post({ name: 'Weak spots' }));
    expect(response.status).toBe(200);
  });

  it('returns a friendly 409 on a duplicate name', async () => {
    bookmarkList.create.mockRejectedValue({ code: 'P2002' });
    const { POST } = await import('./route');
    const response = await POST(post({ name: 'Weak spots' }));
    expect(response.status).toBe(409);
  });
});
