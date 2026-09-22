import { beforeEach, describe, expect, it, vi } from 'vitest';

const getServerSession = vi.fn();
const recordAuditLog = vi.fn();
const batch = { findFirst: vi.fn() };
const batchEnrollment = { findFirst: vi.fn(), update: vi.fn() };

vi.mock('next-auth', () => ({ getServerSession }));
vi.mock('@/lib/auth', () => ({ authOptions: {} }));
vi.mock('@/lib/prisma', () => ({ default: { batch, batchEnrollment } }));
vi.mock('@/lib/audit-log', () => ({ recordAuditLog, requestAuditContext: () => ({}) }));

function patch(body: unknown) {
  return new Request('http://localhost/api/teacher/batches/batch-1/rankings-moderation', { method: 'PATCH', body: JSON.stringify(body) });
}
const params = Promise.resolve({ id: 'batch-1' });

describe('PATCH /api/teacher/batches/[id]/rankings-moderation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getServerSession.mockResolvedValue({ user: { id: 'teacher-1', role: 'TEACHER' } });
    batch.findFirst.mockResolvedValue({ id: 'batch-1' });
    batchEnrollment.findFirst.mockResolvedValue({ id: 'enrollment-1' });
    batchEnrollment.update.mockResolvedValue({ id: 'enrollment-1', excludedFromRankings: true });
  });

  it('rejects unauthenticated callers', async () => {
    getServerSession.mockResolvedValue(null);
    const { PATCH } = await import('./route');
    const response = await PATCH(patch({ studentId: 'student-1', excludedFromRankings: true }), { params });
    expect(response.status).toBe(401);
  });

  it('rejects a missing studentId', async () => {
    const { PATCH } = await import('./route');
    const response = await PATCH(patch({ excludedFromRankings: true }), { params });
    expect(response.status).toBe(400);
  });

  it("404s when the batch doesn't belong to this teacher", async () => {
    batch.findFirst.mockResolvedValue(null);
    const { PATCH } = await import('./route');
    const response = await PATCH(patch({ studentId: 'student-1', excludedFromRankings: true }), { params });
    expect(response.status).toBe(404);
  });

  it('404s when the student is not enrolled in this batch', async () => {
    batchEnrollment.findFirst.mockResolvedValue(null);
    const { PATCH } = await import('./route');
    const response = await PATCH(patch({ studentId: 'student-1', excludedFromRankings: true }), { params });
    expect(response.status).toBe(404);
  });

  it('sets the exclusion flag and audit-logs it', async () => {
    const { PATCH } = await import('./route');
    const response = await PATCH(patch({ studentId: 'student-1', excludedFromRankings: true }), { params });
    expect(response.status).toBe(200);
    expect(batchEnrollment.update).toHaveBeenCalledWith({ where: { id: 'enrollment-1' }, data: { excludedFromRankings: true } });
    expect(recordAuditLog).toHaveBeenCalledWith(expect.objectContaining({ action: 'BATCH_STUDENT_RANKING_EXCLUSION_SET' }));
  });
});
