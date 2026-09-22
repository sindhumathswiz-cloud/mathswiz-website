import { beforeEach, describe, expect, it, vi } from 'vitest';

const getServerSession = vi.fn();
const getUserTotalPoints = vi.fn();
const getUserPointsHistory = vi.fn();

vi.mock('next-auth', () => ({ getServerSession }));
vi.mock('@/lib/auth', () => ({ authOptions: {} }));
vi.mock('@/lib/gamification', () => ({ getUserTotalPoints, getUserPointsHistory }));

describe('GET /api/student/points-summary', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getServerSession.mockResolvedValue({ user: { id: 'student-1', role: 'STUDENT' } });
    getUserTotalPoints.mockResolvedValue(120);
    getUserPointsHistory.mockResolvedValue([{ id: 'tx-1', points: 10, reason: 'Test completed' }]);
  });

  it('rejects non-student roles', async () => {
    getServerSession.mockResolvedValue({ user: { id: 'teacher-1', role: 'TEACHER' } });
    const { GET } = await import('./route');
    expect(((await GET()) as Response).status).toBe(401);
  });

  it("returns the caller's total points and recent history", async () => {
    const { GET } = await import('./route');
    const body = await ((await GET()) as Response).json();
    expect(body.totalPoints).toBe(120);
    expect(body.history).toHaveLength(1);
    expect(getUserTotalPoints).toHaveBeenCalledWith('student-1');
    expect(getUserPointsHistory).toHaveBeenCalledWith('student-1', 10);
  });
});
