import { beforeEach, describe, expect, it, vi } from 'vitest';

const getServerSession = vi.fn();
const recordAuditLog = vi.fn();
const batch = { findFirst: vi.fn() };
const classChallenge = { findMany: vi.fn(), findFirst: vi.fn(), create: vi.fn() };
const computeChallengeRanking = vi.fn();

vi.mock('next-auth', () => ({ getServerSession }));
vi.mock('@/lib/auth', () => ({ authOptions: {} }));
vi.mock('@/lib/prisma', () => ({ default: { batch, classChallenge } }));
vi.mock('@/lib/audit-log', () => ({ recordAuditLog, requestAuditContext: () => ({}) }));
vi.mock('@/lib/class-challenge', () => ({ computeChallengeRanking }));

function post(body: unknown) {
  return new Request('http://localhost/api/teacher/batches/batch-1/challenges', { method: 'POST', body: JSON.stringify(body) });
}
function get() {
  return new Request('http://localhost/api/teacher/batches/batch-1/challenges');
}
const params = Promise.resolve({ id: 'batch-1' });

describe('api/teacher/batches/[id]/challenges', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getServerSession.mockResolvedValue({ user: { id: 'teacher-1', role: 'TEACHER' } });
    batch.findFirst.mockResolvedValue({ id: 'batch-1' });
    classChallenge.findFirst.mockResolvedValue(null);
    classChallenge.create.mockResolvedValue({ id: 'challenge-1', title: 'Practice Sprint', metric: 'MOST_PRACTICE' });
    classChallenge.findMany.mockResolvedValue([]);
    computeChallengeRanking.mockResolvedValue([]);
  });

  describe('POST', () => {
    const validBody = { title: 'Practice Sprint', metric: 'MOST_PRACTICE', startDate: '2026-09-22', endDate: '2026-09-29' };

    it('rejects unauthenticated callers', async () => {
      getServerSession.mockResolvedValue(null);
      const { POST } = await import('./route');
      const response = await ((await POST(post(validBody), { params })) as Response);
      expect(response.status).toBe(401);
    });

    it("404s when the batch doesn't belong to this teacher", async () => {
      batch.findFirst.mockResolvedValue(null);
      const { POST } = await import('./route');
      const response = await ((await POST(post(validBody), { params })) as Response);
      expect(response.status).toBe(404);
    });

    it('rejects an invalid metric', async () => {
      const { POST } = await import('./route');
      const response = await ((await POST(post({ ...validBody, metric: 'NOT_A_METRIC' }), { params })) as Response);
      expect(response.status).toBe(400);
    });

    it('rejects endDate before startDate', async () => {
      const { POST } = await import('./route');
      const response = await ((await POST(post({ ...validBody, startDate: '2026-09-29', endDate: '2026-09-22' }), { params })) as Response);
      expect(response.status).toBe(400);
    });

    it('rejects creating a second ACTIVE challenge for the same batch', async () => {
      classChallenge.findFirst.mockResolvedValue({ id: 'existing-active' });
      const { POST } = await import('./route');
      const response = await ((await POST(post(validBody), { params })) as Response);
      expect(response.status).toBe(409);
    });

    it('creates the challenge and audit-logs it', async () => {
      const { POST } = await import('./route');
      const response = await ((await POST(post(validBody), { params })) as Response);
      expect(response.status).toBe(201);
      expect(classChallenge.create).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({ batchId: 'batch-1', title: 'Practice Sprint', metric: 'MOST_PRACTICE', createdById: 'teacher-1' }),
      }));
      expect(recordAuditLog).toHaveBeenCalledWith(expect.objectContaining({ action: 'CLASS_CHALLENGE_CREATED' }));
    });
  });

  describe('GET', () => {
    it('rejects unauthenticated callers', async () => {
      getServerSession.mockResolvedValue(null);
      const { GET } = await import('./route');
      const response = await ((await GET(get(), { params })) as Response);
      expect(response.status).toBe(401);
    });

    it('returns challenges with a computed ranking attached to each', async () => {
      classChallenge.findMany.mockResolvedValue([{ id: 'challenge-1', batchId: 'batch-1', metric: 'MOST_PRACTICE' }]);
      computeChallengeRanking.mockResolvedValue([{ userId: 'student-1', name: 'A', image: null, value: 5, rank: 1 }]);
      const { GET } = await import('./route');
      const response = await ((await GET(get(), { params })) as Response);
      const data = await response.json();
      expect(data.challenges[0].ranking).toHaveLength(1);
    });
  });
});
