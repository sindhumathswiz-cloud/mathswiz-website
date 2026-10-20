// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

const getServerSession = vi.fn();
const recordAuditLog = vi.fn();
const user = { findUnique: vi.fn(), delete: vi.fn() };
/** Counts per "model.field" for the reference check; anything not listed is 0. */
let counts: Record<string, number> = {};
const countCalls: string[] = [];

const prisma = new Proxy({ user } as Record<string, unknown>, {
  get(target, model: string) {
    if (model in target) return target[model];
    return {
      count: async ({ where }: { where: Record<string, string> }) => {
        const field = Object.keys(where)[0];
        countCalls.push(`${model}.${field}`);
        return counts[`${model}.${field}`] ?? 0;
      },
    };
  },
});

vi.mock('next-auth', () => ({ getServerSession }));
vi.mock('@/lib/auth', () => ({ authOptions: {} }));
vi.mock('@/lib/prisma', () => ({ default: prisma }));
vi.mock('@/lib/audit-log', () => ({ recordAuditLog, requestAuditContext: () => ({}) }));

const del = async (id: string) => {
  const { DELETE } = await import('./route');
  return (await DELETE(new Request(`http://localhost/api/admin/users/${id}`, { method: 'DELETE' }), { params: Promise.resolve({ id }) })) as Response;
};

describe('DELETE /api/admin/users/[id]', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    counts = {};
    countCalls.length = 0;
    getServerSession.mockResolvedValue({ user: { id: 'admin-1', role: 'ADMIN' } });
    user.findUnique.mockResolvedValue({ id: 'u1', firstName: 'Asha', lastName: 'Rao', email: null, role: 'TEACHER' });
    user.delete.mockResolvedValue({});
  });

  it('is for admins only, and never for their own account', async () => {
    getServerSession.mockResolvedValue({ user: { id: 't1', role: 'TEACHER' } });
    expect((await del('u1')).status).toBe(403);
    getServerSession.mockResolvedValue({ user: { id: 'admin-1', role: 'ADMIN' } });
    expect((await del('admin-1')).status).toBe(400);
    expect(user.delete).not.toHaveBeenCalled();
  });

  it('refuses a teacher who authored content, says what is in the way, and points at blocking', async () => {
    counts = { 'question.createdById': 120, 'test.createdById': 3 };
    const res = await del('u1');
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.code).toBe('USER_HAS_RECORDS');
    expect(body.canBlock).toBe(true);
    expect(body.error).toBe('Asha Rao cannot be deleted: they have 120 questions authored and 3 tests created. Block the account instead: it stops them signing in and keeps their records.');
    expect(body.references.map((r: { label: string }) => r.label)).toEqual(['questions authored', 'tests created']);
    expect(user.delete).not.toHaveBeenCalled();
  });

  it('refuses a student with learning history rather than wiping it', async () => {
    counts = { 'studentProgress.userId': 8, 'masteryEvent.userId': 136 };
    const res = await del('u1');
    expect(res.status).toBe(409);
    expect((await res.json()).error).toMatch(/8 topic progress records and 136 practice answers/);
    expect(user.delete).not.toHaveBeenCalled();
  });

  it('deletes an account that never did anything, and records it', async () => {
    const res = await del('u1');
    expect(res.status).toBe(200);
    expect(user.delete).toHaveBeenCalledWith({ where: { id: 'u1' } });
    expect(recordAuditLog).toHaveBeenCalledWith(expect.objectContaining({ action: 'USER_DELETED', entityId: 'u1' }));
    // Every reference was checked, by the right column.
    expect(countCalls).toContain('question.createdById');
    expect(countCalls).toContain('testAttempt.userId');
    expect(countCalls).toContain('parentLink.studentId');
  });

  it('refuses clearly if something was attached between the check and the delete', async () => {
    user.delete.mockRejectedValue(Object.assign(new Error('Foreign key constraint violated'), { code: 'P2003' }));
    const res = await del('u1');
    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe('USER_HAS_RECORDS');
  });

  it('says when the user does not exist', async () => {
    user.findUnique.mockResolvedValue(null);
    expect((await del('nobody')).status).toBe(404);
  });
});
