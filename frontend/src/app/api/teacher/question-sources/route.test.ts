import { beforeEach, describe, expect, it, vi } from 'vitest';

const getServerSession = vi.fn();
const loadQuestionSources = vi.fn();
const user = { findUnique: vi.fn() };

vi.mock('next-auth', () => ({ getServerSession }));
vi.mock('@/lib/auth', () => ({ authOptions: {} }));
vi.mock('@/lib/prisma', () => ({ default: { user } }));
vi.mock('@/lib/question-sources', () => ({ loadQuestionSources }));

describe('GET /api/teacher/question-sources', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getServerSession.mockResolvedValue({ user: { id: 't1', role: 'TEACHER' } });
    user.findUnique.mockResolvedValue({ subscription: 'PREMIUM' });
    loadQuestionSources.mockResolvedValue([{ id: 'b1', title: 'Xam Idea', className: 'Class 12', total: 3, chapters: [] }]);
  });

  it('rejects anonymous callers, students, and free teachers without loading anything', async () => {
    const { GET } = await import('./route');
    getServerSession.mockResolvedValueOnce(null);
    expect((await GET()).status).toBe(401);
    getServerSession.mockResolvedValueOnce({ user: { id: 's1', role: 'STUDENT' } });
    expect((await GET()).status).toBe(403);
    user.findUnique.mockResolvedValueOnce({ subscription: 'FREE' });
    expect((await GET()).status).toBe(403);
    expect(loadQuestionSources).not.toHaveBeenCalled();
  });

  it('returns the tree to a premium teacher and to an admin', async () => {
    const { GET } = await import('./route');
    expect(await (await GET()).json()).toEqual({ books: [expect.objectContaining({ id: 'b1' })] });
    getServerSession.mockResolvedValueOnce({ user: { id: 'a1', role: 'ADMIN' } });
    expect((await GET()).status).toBe(200);
  });
});
