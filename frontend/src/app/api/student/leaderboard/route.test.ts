import { beforeEach, describe, expect, it, vi } from 'vitest';

const getServerSession = vi.fn();
const batchEnrollment = { findMany: vi.fn(), findFirst: vi.fn() };
const user = { findUnique: vi.fn() };
const computeBatchLeaderboard = vi.fn();

vi.mock('next-auth', () => ({ getServerSession }));
vi.mock('@/lib/auth', () => ({ authOptions: {} }));
vi.mock('@/lib/prisma', () => ({ default: { batchEnrollment, user } }));
vi.mock('@/lib/leaderboard', () => ({ computeBatchLeaderboard }));

function get(qs = '') {
  return new Request(`http://localhost/api/student/leaderboard${qs}`);
}

describe('GET /api/student/leaderboard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getServerSession.mockResolvedValue({ user: { id: 'student-1' } });
    batchEnrollment.findMany.mockResolvedValue([{ batchId: 'batch-1' }]);
    batchEnrollment.findFirst.mockResolvedValue({ id: 'enrollment-1' });
    user.findUnique.mockResolvedValue({ leaderboardOptIn: true });
    computeBatchLeaderboard.mockResolvedValue({ enabled: true, leaderboard: [] });
  });

  it('rejects unauthenticated callers', async () => {
    getServerSession.mockResolvedValue(null);
    const { GET } = await import('./route');
    const response = await GET(get());
    expect(response.status).toBe(401);
  });

  it('rejects a student not enrolled in the target batch', async () => {
    batchEnrollment.findFirst.mockResolvedValue(null);
    const { GET } = await import('./route');
    const response = await GET(get('?batchId=batch-2'));
    expect(response.status).toBe(403);
  });

  it('returns enabled:false with an empty leaderboard when the student has no batch at all', async () => {
    batchEnrollment.findMany.mockResolvedValue([]);
    const { GET } = await import('./route');
    const body = await (await GET(get())).json();
    expect(body).toMatchObject({ leaderboard: [], userRank: null, totalStudents: 0, enabled: false, optedIn: false });
    expect(computeBatchLeaderboard).not.toHaveBeenCalled();
  });

  it("surfaces the caller's own opt-in status alongside the computed leaderboard", async () => {
    user.findUnique.mockResolvedValue({ leaderboardOptIn: false });
    computeBatchLeaderboard.mockResolvedValue({
      enabled: true,
      leaderboard: [{ userId: 'other-student', rank: 1, combinedScore: 90 }],
    });
    const { GET } = await import('./route');
    const body = await (await GET(get())).json();
    expect(body.optedIn).toBe(false);
    expect(body.enabled).toBe(true);
    expect(body.userRank).toBeNull(); // caller isn't in the list (not opted in)
  });

  it('resolves userRank from the entry matching the caller', async () => {
    computeBatchLeaderboard.mockResolvedValue({
      enabled: true,
      leaderboard: [{ userId: 'student-1', rank: 2, combinedScore: 80 }, { userId: 'other', rank: 1, combinedScore: 90 }],
    });
    const { GET } = await import('./route');
    const body = await (await GET(get())).json();
    expect(body.userRank).toBe(2);
    expect(body.totalStudents).toBe(2);
  });
});
