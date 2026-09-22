import { beforeEach, describe, expect, it, vi } from 'vitest';

const getServerSession = vi.fn();
const batchEnrollment = { findMany: vi.fn(), findFirst: vi.fn() };
const classChallenge = { findFirst: vi.fn() };
const computeChallengeRanking = vi.fn();

vi.mock('next-auth', () => ({ getServerSession }));
vi.mock('@/lib/auth', () => ({ authOptions: {} }));
vi.mock('@/lib/prisma', () => ({ default: { batchEnrollment, classChallenge } }));
vi.mock('@/lib/class-challenge', () => ({ computeChallengeRanking }));

function get(qs = '') {
  return new Request(`http://localhost/api/student/challenges/class${qs}`);
}

describe('GET /api/student/challenges/class', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getServerSession.mockResolvedValue({ user: { id: 'student-1' } });
    batchEnrollment.findMany.mockResolvedValue([{ batchId: 'batch-1' }]);
    batchEnrollment.findFirst.mockResolvedValue({ id: 'enrollment-1' });
    classChallenge.findFirst.mockResolvedValue(null);
    computeChallengeRanking.mockResolvedValue([]);
  });

  it('rejects unauthenticated callers', async () => {
    getServerSession.mockResolvedValue(null);
    const { GET } = await import('./route');
    const response = await ((await GET(get())) as Response);
    expect(response.status).toBe(401);
  });

  it('rejects a student not enrolled in the target batch', async () => {
    batchEnrollment.findFirst.mockResolvedValue(null);
    const { GET } = await import('./route');
    const response = await ((await GET(get('?batchId=batch-2'))) as Response);
    expect(response.status).toBe(403);
  });

  it('returns challenge:null when the student has no batch at all', async () => {
    batchEnrollment.findMany.mockResolvedValue([]);
    const { GET } = await import('./route');
    const body = await (await GET(get())).json();
    expect(body).toMatchObject({ challenge: null, ranking: [], userRank: null });
  });

  it('returns challenge:null when the batch has no active challenge', async () => {
    const { GET } = await import('./route');
    const body = await (await GET(get())).json();
    expect(body.challenge).toBeNull();
    expect(computeChallengeRanking).not.toHaveBeenCalled();
  });

  it('returns the active challenge with a computed ranking and the caller rank', async () => {
    classChallenge.findFirst.mockResolvedValue({ id: 'challenge-1', batchId: 'batch-1', metric: 'POINTS_EARNED', status: 'ACTIVE' });
    computeChallengeRanking.mockResolvedValue([
      { userId: 'other', name: 'Other', image: null, value: 90, rank: 1 },
      { userId: 'student-1', name: 'Me', image: null, value: 80, rank: 2 },
    ]);
    const { GET } = await import('./route');
    const body = await (await GET(get())).json();
    expect(body.challenge.id).toBe('challenge-1');
    expect(body.userRank).toBe(2);
    expect(body.ranking).toHaveLength(2);
  });
});
