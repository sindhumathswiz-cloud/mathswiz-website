import { beforeEach, describe, expect, it, vi } from 'vitest';

const getServerSession = vi.fn();
const recordAuditLog = vi.fn();
const batch = { findFirst: vi.fn() };
const classChallenge = { findFirst: vi.fn(), update: vi.fn() };

vi.mock('next-auth', () => ({ getServerSession }));
vi.mock('@/lib/auth', () => ({ authOptions: {} }));
vi.mock('@/lib/prisma', () => ({ default: { batch, classChallenge } }));
vi.mock('@/lib/audit-log', () => ({ recordAuditLog, requestAuditContext: () => ({}) }));

function patch(body: unknown) {
  return new Request('http://localhost/api/teacher/batches/batch-1/challenges/challenge-1', { method: 'PATCH', body: JSON.stringify(body) });
}
const params = Promise.resolve({ id: 'batch-1', challengeId: 'challenge-1' });

describe('PATCH /api/teacher/batches/[id]/challenges/[challengeId]', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getServerSession.mockResolvedValue({ user: { id: 'teacher-1', role: 'TEACHER' } });
    batch.findFirst.mockResolvedValue({ id: 'batch-1' });
    classChallenge.findFirst.mockResolvedValue({ id: 'challenge-1', batchId: 'batch-1', status: 'ACTIVE' });
    classChallenge.update.mockResolvedValue({ id: 'challenge-1', status: 'ENDED' });
  });

  it('rejects unauthenticated callers', async () => {
    getServerSession.mockResolvedValue(null);
    const { PATCH } = await import('./route');
    const response = await ((await PATCH(patch({ status: 'ENDED' }), { params })) as Response);
    expect(response.status).toBe(401);
  });

  it('rejects an invalid status', async () => {
    const { PATCH } = await import('./route');
    const response = await ((await PATCH(patch({ status: 'ACTIVE' }), { params })) as Response);
    expect(response.status).toBe(400);
  });

  it("404s when the batch doesn't belong to this teacher", async () => {
    batch.findFirst.mockResolvedValue(null);
    const { PATCH } = await import('./route');
    const response = await ((await PATCH(patch({ status: 'ENDED' }), { params })) as Response);
    expect(response.status).toBe(404);
  });

  it('404s when the challenge does not exist for this batch', async () => {
    classChallenge.findFirst.mockResolvedValue(null);
    const { PATCH } = await import('./route');
    const response = await ((await PATCH(patch({ status: 'ENDED' }), { params })) as Response);
    expect(response.status).toBe(404);
  });

  it('rejects re-ending a challenge that is already ended', async () => {
    classChallenge.findFirst.mockResolvedValue({ id: 'challenge-1', batchId: 'batch-1', status: 'ENDED' });
    const { PATCH } = await import('./route');
    const response = await ((await PATCH(patch({ status: 'ENDED' }), { params })) as Response);
    expect(response.status).toBe(409);
  });

  it('ends the challenge, stamps endedAt/endedBy, and audit-logs it', async () => {
    const { PATCH } = await import('./route');
    const response = await ((await PATCH(patch({ status: 'ENDED' }), { params })) as Response);
    expect(response.status).toBe(200);
    expect(classChallenge.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'challenge-1' },
      data: expect.objectContaining({ status: 'ENDED', endedBy: 'teacher-1' }),
    }));
    expect(recordAuditLog).toHaveBeenCalledWith(expect.objectContaining({ action: 'CLASS_CHALLENGE_ENDED' }));
  });

  it('supports cancelling instead of ending', async () => {
    const { PATCH } = await import('./route');
    const response = await ((await PATCH(patch({ status: 'CANCELLED' }), { params })) as Response);
    expect(response.status).toBe(200);
    expect(recordAuditLog).toHaveBeenCalledWith(expect.objectContaining({ action: 'CLASS_CHALLENGE_CANCELLED' }));
  });
});
