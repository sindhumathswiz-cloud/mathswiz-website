import { beforeEach, describe, expect, it, vi } from 'vitest';

const getAuthenticatedUser = vi.fn();
vi.mock('@/lib/auth-server', () => ({ getAuthenticatedUser }));

const batch = { findMany: vi.fn() };
const batchEnrollment = { findMany: vi.fn() };
const studentProgress = { findMany: vi.fn() };
vi.mock('@/lib/prisma', () => ({ default: { batch, batchEnrollment, studentProgress } }));

describe('GET /api/admin/reports/class-performance', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getAuthenticatedUser.mockResolvedValue({ user: { id: 'admin-1', role: 'ADMIN' } });
    batch.findMany.mockResolvedValue([]);
    batchEnrollment.findMany.mockResolvedValue([]);
    studentProgress.findMany.mockResolvedValue([]);
  });

  it('rejects non-admin callers', async () => {
    getAuthenticatedUser.mockResolvedValue({ error: new Response(null, { status: 403 }) });
    const { GET } = await import('./route');
    expect(((await GET()) as Response).status).toBe(403);
    expect(batch.findMany).not.toHaveBeenCalled();
  });

  it('drops a batch with zero approved students', async () => {
    batch.findMany.mockResolvedValue([{ id: 'batch-1', name: 'Empty Batch', class: '11', teacher: { firstName: 'T', lastName: 'One' } }]);
    const { GET } = await import('./route');
    const body = await ((await GET()) as Response).json();
    expect(body.classPerformance).toEqual([]);
  });

  it('aggregates avg mastery and at-risk count per batch, sorted weakest first', async () => {
    batch.findMany.mockResolvedValue([
      { id: 'batch-strong', name: 'Strong Batch', class: '11', teacher: { firstName: 'T', lastName: 'One' } },
      { id: 'batch-weak', name: 'Weak Batch', class: '12', teacher: { firstName: 'T', lastName: 'Two' } },
    ]);
    batchEnrollment.findMany.mockResolvedValue([
      { batchId: 'batch-strong', studentId: 'student-1' },
      { batchId: 'batch-weak', studentId: 'student-2' },
    ]);
    studentProgress.findMany.mockResolvedValue([
      { userId: 'student-1', topic: 'Algebra', masteryScore: 90 },
      { userId: 'student-2', topic: 'Algebra', masteryScore: 10 },
    ]);
    const { GET } = await import('./route');
    const body = await ((await GET()) as Response).json();

    expect(body.classPerformance).toHaveLength(2);
    expect(body.classPerformance[0].batchId).toBe('batch-weak'); // weakest first
    expect(body.classPerformance[0].atRiskStudentCount).toBe(1);
    expect(body.classPerformance[1].batchId).toBe('batch-strong');
    expect(body.classPerformance[1].atRiskStudentCount).toBe(0);
  });
});
