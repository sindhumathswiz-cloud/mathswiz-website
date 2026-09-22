import { beforeEach, describe, expect, it, vi } from 'vitest';

const getServerSession = vi.fn();
const questionVersion = { findMany: vi.fn() };

vi.mock('next-auth', () => ({ getServerSession }));
vi.mock('@/lib/auth', () => ({ authOptions: {} }));
vi.mock('@/lib/prisma', () => ({ default: { questionVersion } }));

function get() {
  return new Request('http://localhost/api/admin/questions/q-1/versions');
}
const params = Promise.resolve({ id: 'q-1' });

describe('GET /api/admin/questions/[id]/versions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getServerSession.mockResolvedValue({ user: { id: 'admin-1', role: 'ADMIN' } });
    questionVersion.findMany.mockResolvedValue([]);
  });

  it('rejects unauthenticated callers', async () => {
    getServerSession.mockResolvedValue(null);
    const { GET } = await import('./route');
    const response = await ((await GET(get(), { params })) as Response);
    expect(response.status).toBe(401);
  });

  it('rejects a non-admin caller', async () => {
    getServerSession.mockResolvedValue({ user: { id: 'teacher-1', role: 'TEACHER' } });
    const { GET } = await import('./route');
    const response = await ((await GET(get(), { params })) as Response);
    expect(response.status).toBe(403);
  });

  it('returns versions ordered newest-first', async () => {
    const { GET } = await import('./route');
    await GET(get(), { params });
    expect(questionVersion.findMany).toHaveBeenCalledWith({
      where: { questionId: 'q-1' },
      orderBy: { version: 'desc' },
    });
  });
});
