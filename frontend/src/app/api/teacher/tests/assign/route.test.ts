import { beforeEach, describe, expect, it, vi } from 'vitest';

const getServerSession = vi.fn();
const recordAuditLog = vi.fn();
const test = { findFirst: vi.fn() };
const batch = { findFirst: vi.fn() };
const batchEnrollment = { findFirst: vi.fn() };
const testAssignment = { create: vi.fn() };

vi.mock('next-auth', () => ({ getServerSession }));
vi.mock('@/lib/auth', () => ({ authOptions: {} }));
vi.mock('@/lib/prisma', () => ({ default: { test, batch, batchEnrollment, testAssignment } }));
vi.mock('@/lib/audit-log', () => ({ recordAuditLog, requestAuditContext: () => ({}) }));

describe('teacher homework assignment', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getServerSession.mockResolvedValue({ user: { id: 'teacher-1', role: 'TEACHER' } });
    test.findFirst.mockResolvedValue({ id: 'test-1', isPublished: true });
    batch.findFirst.mockResolvedValue({ id: 'batch-1' });
    testAssignment.create.mockResolvedValue({ id: 'assignment-1', kind: 'HOMEWORK' });
  });

  async function assign(body: Record<string, unknown>) {
    const { POST } = await import('./route');
    return POST(new Request('http://localhost/api/teacher/tests/assign', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }));
  }

  it('creates and audits an owned homework assignment', async () => {
    const response = await assign({
      testId: 'test-1',
      batchId: 'batch-1',
      kind: 'HOMEWORK',
      instructions: 'Show your working.',
      maxAttempts: 2,
      deadline: '2026-08-20T12:00:00.000Z',
    });

    expect(response.status).toBe(201);
    expect(testAssignment.create).toHaveBeenCalledWith({ data: expect.objectContaining({
      kind: 'HOMEWORK',
      instructions: 'Show your working.',
      maxAttempts: 2,
    }) });
    expect(recordAuditLog).toHaveBeenCalledWith(expect.objectContaining({ action: 'HOMEWORK_ASSIGNED' }));
  });

  it('rejects non-teacher roles', async () => {
    getServerSession.mockResolvedValue({ user: { id: 'student-1', role: 'STUDENT' } });
    expect((await assign({ testId: 'test-1', batchId: 'batch-1' })).status).toBe(403);
    expect(testAssignment.create).not.toHaveBeenCalled();
  });

  it('rejects unpublished tests and invalid date ranges', async () => {
    test.findFirst.mockResolvedValue({ id: 'test-1', isPublished: false });
    expect((await assign({ testId: 'test-1', batchId: 'batch-1' })).status).toBe(400);

    const invalidDates = await assign({
      testId: 'test-1',
      batchId: 'batch-1',
      scheduledFor: '2026-08-20T12:00:00.000Z',
      deadline: '2026-08-20T11:00:00.000Z',
    });
    expect(invalidDates.status).toBe(400);
    expect(testAssignment.create).not.toHaveBeenCalled();
  });
});
