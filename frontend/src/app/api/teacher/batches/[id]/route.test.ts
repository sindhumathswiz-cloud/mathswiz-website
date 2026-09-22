import { beforeEach, describe, expect, it, vi } from 'vitest';

const getServerSession = vi.fn();
const recordAuditLog = vi.fn();
const batch = { findFirst: vi.fn(), update: vi.fn() };

vi.mock('next-auth', () => ({ getServerSession }));
vi.mock('@/lib/auth', () => ({ authOptions: {} }));
vi.mock('@/lib/prisma', () => ({ default: { batch } }));
vi.mock('@/lib/audit-log', () => ({ recordAuditLog, requestAuditContext: () => ({}) }));

function patch(body: unknown) {
  return new Request('http://localhost/api/teacher/batches/batch-1', { method: 'PATCH', body: JSON.stringify(body) });
}
const params = Promise.resolve({ id: 'batch-1' });

describe('PATCH /api/teacher/batches/[id]', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getServerSession.mockResolvedValue({ user: { id: 'teacher-1', role: 'TEACHER' } });
    batch.findFirst.mockResolvedValue({ id: 'batch-1' });
    batch.update.mockResolvedValue({ id: 'batch-1', leaderboardEnabled: true });
  });

  it('rejects unauthenticated callers', async () => {
    getServerSession.mockResolvedValue(null);
    const { PATCH } = await import('./route');
    const response = await PATCH(patch({ leaderboardEnabled: true }), { params });
    expect(response.status).toBe(401);
  });

  it('rejects a non-boolean leaderboardEnabled', async () => {
    const { PATCH } = await import('./route');
    const response = await PATCH(patch({ leaderboardEnabled: 'yes' }), { params });
    expect(response.status).toBe(400);
  });

  it("404s when the batch doesn't belong to this teacher", async () => {
    batch.findFirst.mockResolvedValue(null);
    const { PATCH } = await import('./route');
    const response = await PATCH(patch({ leaderboardEnabled: true }), { params });
    expect(response.status).toBe(404);
    expect(batch.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'batch-1', teacherId: 'teacher-1' },
    }));
  });

  it('toggles the flag and audit-logs it', async () => {
    const { PATCH } = await import('./route');
    const response = await PATCH(patch({ leaderboardEnabled: true }), { params });
    expect(response.status).toBe(200);
    expect(batch.update).toHaveBeenCalledWith({ where: { id: 'batch-1' }, data: { leaderboardEnabled: true } });
    expect(recordAuditLog).toHaveBeenCalledWith(expect.objectContaining({ action: 'BATCH_LEADERBOARD_TOGGLED' }));
  });

  it('allows an admin to bypass the ownership filter', async () => {
    getServerSession.mockResolvedValue({ user: { id: 'admin-1', role: 'ADMIN' } });
    const { PATCH } = await import('./route');
    await PATCH(patch({ leaderboardEnabled: false }), { params });
    expect(batch.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'batch-1' } }));
  });
});
