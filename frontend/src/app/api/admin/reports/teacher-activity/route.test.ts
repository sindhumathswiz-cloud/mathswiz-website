import { beforeEach, describe, expect, it, vi } from 'vitest';

const getAuthenticatedUser = vi.fn();
vi.mock('@/lib/auth-server', () => ({ getAuthenticatedUser }));

const auditLog = { groupBy: vi.fn() };
const user = { findMany: vi.fn() };
vi.mock('@/lib/prisma', () => ({ default: { auditLog, user } }));

function get(qs = '') {
  return new Request(`http://localhost/api/admin/reports/teacher-activity${qs}`);
}

describe('GET /api/admin/reports/teacher-activity', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getAuthenticatedUser.mockResolvedValue({ user: { id: 'admin-1', role: 'ADMIN' } });
    auditLog.groupBy.mockResolvedValue([]);
    user.findMany.mockResolvedValue([]);
  });

  it('rejects non-admin callers', async () => {
    getAuthenticatedUser.mockResolvedValue({ error: new Response(null, { status: 403 }) });
    const { GET } = await import('./route');
    expect(((await GET(get())) as Response).status).toBe(403);
    expect(auditLog.groupBy).not.toHaveBeenCalled();
  });

  it('scopes the query to TEACHER actors within the default 30-day window', async () => {
    const { GET } = await import('./route');
    await GET(get());
    expect(auditLog.groupBy).toHaveBeenCalledWith(expect.objectContaining({
      by: ['actorId', 'action'],
      where: expect.objectContaining({ actorRole: 'TEACHER' }),
    }));
  });

  it('caps an oversized ?days= request at 90', async () => {
    const { GET } = await import('./route');
    await GET(get('?days=365'));
    const call = auditLog.groupBy.mock.calls[0][0];
    const windowStart = call.where.createdAt.gte as Date;
    const daysBack = Math.round((Date.now() - windowStart.getTime()) / (24 * 60 * 60 * 1000));
    expect(daysBack).toBeLessThanOrEqual(90);
  });

  it('rolls up per-actor action counts and totals, sorted busiest first', async () => {
    auditLog.groupBy.mockResolvedValue([
      { actorId: 'teacher-1', action: 'INTERVENTION_CREATED', _count: { _all: 3 } },
      { actorId: 'teacher-1', action: 'HOMEWORK_REVIEWED', _count: { _all: 2 } },
      { actorId: 'teacher-2', action: 'INTERVENTION_CREATED', _count: { _all: 10 } },
    ]);
    user.findMany.mockResolvedValue([
      { id: 'teacher-1', firstName: 'A', lastName: 'One' },
      { id: 'teacher-2', firstName: 'B', lastName: 'Two' },
    ]);
    const { GET } = await import('./route');
    const body = await ((await GET(get())) as Response).json();

    expect(body.teacherActivity[0].teacherId).toBe('teacher-2');
    expect(body.teacherActivity[0].totalActions).toBe(10);
    expect(body.teacherActivity[1].totalActions).toBe(5);
    expect(body.teacherActivity[1].actionCounts).toEqual({ INTERVENTION_CREATED: 3, HOMEWORK_REVIEWED: 2 });
  });
});
