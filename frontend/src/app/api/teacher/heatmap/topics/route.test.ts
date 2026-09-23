import { beforeEach, describe, expect, it, vi } from 'vitest';

const getServerSession = vi.fn();
const batchEnrollment = { findMany: vi.fn() };
const studentProgress = { groupBy: vi.fn(), findMany: vi.fn(), update: vi.fn() };
const masteryEvent = { create: vi.fn() };

vi.mock('next-auth', () => ({ getServerSession }));
vi.mock('@/lib/auth', () => ({ authOptions: {} }));
vi.mock('@/lib/prisma', () => ({ default: { batchEnrollment, studentProgress, masteryEvent } }));

function get(url: string) {
  return import('./route').then(({ GET }) => GET(new Request(url)));
}

describe('GET /api/teacher/heatmap/topics', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getServerSession.mockResolvedValue({ user: { id: 'teacher-1', role: 'TEACHER' } });
    // sweepStaleMastery() runs before the route's own groupBy -- no stale
    // rows in these tests, so it's a no-op.
    studentProgress.findMany.mockResolvedValue([]);
    studentProgress.update.mockResolvedValue({});
    masteryEvent.create.mockResolvedValue({});
  });

  it('rejects non-teacher roles', async () => {
    getServerSession.mockResolvedValue({ user: { id: 'admin-1', role: 'ADMIN' } });
    const response = await get('http://localhost/api/teacher/heatmap/topics?batchId=batch-1');
    expect(response.status).toBe(401);
  });

  it('rejects a missing batchId', async () => {
    const response = await get('http://localhost/api/teacher/heatmap/topics');
    expect(response.status).toBe(400);
  });

  it('returns empty topics for a batch with no approved enrollments', async () => {
    batchEnrollment.findMany.mockResolvedValue([]);
    const response = await get('http://localhost/api/teacher/heatmap/topics?batchId=batch-1');
    const body = await response.json();
    expect(body.topics).toEqual([]);
    expect(studentProgress.groupBy).not.toHaveBeenCalled();
  });

  it('groups by topic, scoped to the batch teacher owns, sorted weakest-first', async () => {
    batchEnrollment.findMany.mockResolvedValue([{ studentId: 's-1' }, { studentId: 's-2' }]);
    studentProgress.groupBy.mockResolvedValue([
      { topic: 'Algebra', _avg: { masteryScore: 80 }, _count: { _all: 2 } },
      { topic: 'Geometry', _avg: { masteryScore: 30 }, _count: { _all: 2 } },
    ]);
    const response = await get('http://localhost/api/teacher/heatmap/topics?batchId=batch-1');
    const body = await response.json();
    expect(studentProgress.groupBy).toHaveBeenCalledWith(expect.objectContaining({
      by: ['topic'],
      where: { userId: { in: ['s-1', 's-2'] } },
    }));
    expect(body.topics[0].topic).toBe('Geometry');
    expect(body.topics[0].avgMastery).toBe(30);
    expect(body.topics[1].topic).toBe('Algebra');
  });
});
