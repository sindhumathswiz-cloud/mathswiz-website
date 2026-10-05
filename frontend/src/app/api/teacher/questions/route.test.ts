import { beforeEach, describe, expect, it, vi } from 'vitest';

const getServerSession = vi.fn();
const question = { findMany: vi.fn() };
const user = { findUnique: vi.fn() };
const resolveSourceClauses = vi.fn();

vi.mock('next-auth', () => ({ getServerSession }));
vi.mock('@/lib/auth', () => ({ authOptions: {} }));
vi.mock('@/lib/prisma', () => ({ default: { question, user } }));
vi.mock('@/lib/question-sources', () => ({ resolveSourceClauses }));

const get = async (query = '') => { const { GET } = await import('./route'); return await GET(new Request(`http://localhost/api/teacher/questions${query}`)) as Response; };

describe('GET /api/teacher/questions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getServerSession.mockResolvedValue({ user: { id: 't1', role: 'TEACHER' } });
    user.findUnique.mockResolvedValue({ subscription: 'PREMIUM' });
    question.findMany.mockResolvedValue([]);
    resolveSourceClauses.mockResolvedValue([{ bookId: 'b1' }]);
  });

  it('is for premium teachers only', async () => {
    user.findUnique.mockResolvedValue({ subscription: 'FREE' });
    expect((await get()).status).toBe(403);
    expect(question.findMany).not.toHaveBeenCalled();
  });

  it('does not touch the source resolver when no book filter is given', async () => {
    await get('?topic=Integrals');
    expect(resolveSourceClauses).not.toHaveBeenCalled();
    expect(question.findMany.mock.calls[0][0].where.AND).toBeUndefined();
  });

  it('ANDs the book / chapter / exercise filter with the visibility scope instead of replacing it', async () => {
    await get('?bookId=b1&bookChapterId=c7&bookExerciseId=e1');
    expect(resolveSourceClauses).toHaveBeenCalledWith({ bookId: 'b1', bookChapterId: 'c7', bookExerciseId: 'e1' });
    const where = question.findMany.mock.calls[0][0].where;
    // The scope rule (public approved, or the teacher's own) must survive alongside the source filter.
    expect(where.OR).toEqual([{ status: 'APPROVED', scope: 'PUBLIC' }, { createdById: 't1' }]);
    expect(where.AND).toEqual([{ bookId: 'b1' }]);
  });
});
