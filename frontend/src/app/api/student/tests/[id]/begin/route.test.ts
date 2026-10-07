import { beforeEach, describe, expect, it, vi } from 'vitest';

const getServerSession = vi.fn();
const testAttempt = { findFirst: vi.fn(), updateMany: vi.fn(), findUniqueOrThrow: vi.fn() };
const test = { findUnique: vi.fn() };

vi.mock('next-auth', () => ({ getServerSession }));
vi.mock('@/lib/auth', () => ({ authOptions: {} }));
vi.mock('@/lib/prisma', () => ({ default: { testAttempt, test } }));

const call = async (body: unknown = { attemptId: 'a1' }) => {
  const { POST } = await import('./route');
  return POST(new Request('http://localhost/x', { method: 'POST', body: JSON.stringify(body) }), { params: Promise.resolve({ id: 't1' }) });
};

describe('POST /api/student/tests/[id]/begin', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getServerSession.mockResolvedValue({ user: { id: 's1', role: 'STUDENT' } });
    testAttempt.findFirst.mockResolvedValue({ id: 'a1', startTime: new Date(), examStartedAt: null });
    test.findUnique.mockResolvedValue({ duration: 60 });
    testAttempt.updateMany.mockResolvedValue({ count: 1 });
  });

  it('refuses non-students and an attempt that is not this student in-progress one', async () => {
    getServerSession.mockResolvedValue({ user: { id: 't1', role: 'TEACHER' } });
    expect((await call()).status).toBe(403);
    getServerSession.mockResolvedValue({ user: { id: 's1', role: 'STUDENT' } });
    testAttempt.findFirst.mockResolvedValue(null);
    expect((await call()).status).toBe(404);
    expect(testAttempt.findFirst).toHaveBeenCalledWith({ where: { id: 'a1', userId: 's1', testId: 't1', status: 'IN_PROGRESS' } });
  });

  it('starts the clock once, and a repeat call returns the original start and a shrinking time', async () => {
    const started = new Date(Date.now() - 10 * 60_000);
    testAttempt.findUniqueOrThrow.mockResolvedValue({ id: 'a1', startTime: started, examStartedAt: started });
    const body = await (await call()).json();

    // The write only targets an attempt whose clock has not started.
    expect(testAttempt.updateMany).toHaveBeenCalledWith({ where: { id: 'a1', examStartedAt: null }, data: { examStartedAt: expect.any(Date) } });
    expect(new Date(body.examStartedAt).getTime()).toBe(started.getTime());
    expect(body.secondsRemaining).toBeGreaterThan(49 * 60);
    expect(body.secondsRemaining).toBeLessThanOrEqual(50 * 60);
  });
});
