import { beforeEach, describe, expect, it, vi } from 'vitest';

const getServerSession = vi.fn();
const recordAuditLog = vi.fn();
const test = { findFirst: vi.fn(), update: vi.fn() };

vi.mock('next-auth', () => ({ getServerSession }));
vi.mock('@/lib/auth', () => ({ authOptions: {} }));
vi.mock('@/lib/prisma', () => ({ default: { test } }));
vi.mock('@/lib/audit-log', () => ({ recordAuditLog, requestAuditContext: () => ({}) }));

const params = (testId: string) => Promise.resolve({ testId });
function patch(body: unknown) {
  return new Request('http://localhost/api/teacher/tests/test-1/publish', {
    method: 'PATCH',
    body: JSON.stringify(body),
  });
}

describe('PATCH /api/teacher/tests/[testId]/publish', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getServerSession.mockResolvedValue({ user: { id: 'teacher-1', role: 'TEACHER' } });
    test.findFirst.mockResolvedValue({ id: 'test-1' });
    test.update.mockResolvedValue({ id: 'test-1', isPublished: true });
  });

  it('rejects non-teacher roles', async () => {
    getServerSession.mockResolvedValue({ user: { id: 'student-1', role: 'STUDENT' } });
    const { PATCH } = await import('./route');
    const response = await PATCH(patch({ isPublished: true }), { params: params('test-1') });
    expect(response.status).toBe(403);
  });

  it('rejects a missing isPublished field', async () => {
    const { PATCH } = await import('./route');
    const response = await PATCH(patch({}), { params: params('test-1') });
    expect(response.status).toBe(400);
  });

  it('403s when the test is not owned by the caller', async () => {
    test.findFirst.mockResolvedValue(null);
    const { PATCH } = await import('./route');
    const response = await PATCH(patch({ isPublished: true }), { params: params('test-1') });
    expect(response.status).toBe(403);
    expect(test.update).not.toHaveBeenCalled();
  });

  it('publishes a test and audit-logs TEST_PUBLISHED', async () => {
    const { PATCH } = await import('./route');
    const response = await PATCH(patch({ isPublished: true }), { params: params('test-1') });
    expect(response.status).toBe(200);
    expect(test.update).toHaveBeenCalledWith({ where: { id: 'test-1' }, data: { isPublished: true } });
    expect(recordAuditLog).toHaveBeenCalledWith(expect.objectContaining({ action: 'TEST_PUBLISHED' }));
  });

  it('unpublishes a test and audit-logs TEST_UNPUBLISHED', async () => {
    test.update.mockResolvedValue({ id: 'test-1', isPublished: false });
    const { PATCH } = await import('./route');
    const response = await PATCH(patch({ isPublished: false }), { params: params('test-1') });
    expect(response.status).toBe(200);
    expect(recordAuditLog).toHaveBeenCalledWith(expect.objectContaining({ action: 'TEST_UNPUBLISHED' }));
  });
});
