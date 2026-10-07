import { beforeEach, describe, expect, it, vi } from 'vitest';

const getServerSession = vi.fn();
const testAttempt = { findFirst: vi.fn(), update: vi.fn() };
const test = { findUnique: vi.fn() };

vi.mock('next-auth', () => ({ getServerSession }));
vi.mock('@/lib/auth', () => ({ authOptions: {} }));
vi.mock('@/lib/prisma', () => ({ default: { testAttempt, test } }));

const call = async (body: unknown) => {
  const { POST } = await import('./route');
  return POST(new Request('http://localhost/x', { method: 'POST', body: typeof body === 'string' ? body : JSON.stringify(body) }), { params: Promise.resolve({ id: 't1' }) });
};
const startedAgo = (seconds: number) => new Date(Date.now() - seconds * 1000);

describe('POST /api/student/tests/[id]/progress', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getServerSession.mockResolvedValue({ user: { id: 's1', role: 'STUDENT' } });
    test.findUnique.mockResolvedValue({ duration: 60 });
    testAttempt.findFirst.mockResolvedValue({ id: 'a1', startTime: startedAgo(600), examStartedAt: startedAgo(300) });
    testAttempt.update.mockResolvedValue({});
  });

  it('saves the answers while the clock is running', async () => {
    const responses = { q1: { selectedOption: 'A', status: 'ANSWERED', timeSpent: 3 } };
    const res = await call({ attemptId: 'a1', responses });
    expect(res.status).toBe(200);
    expect(testAttempt.update).toHaveBeenCalledWith({ where: { id: 'a1' }, data: { savedResponses: responses, savedAt: expect.any(Date) } });
  });

  it('refuses a save once the deadline and grace have passed, and before the clock has started', async () => {
    testAttempt.findFirst.mockResolvedValue({ id: 'a1', startTime: startedAgo(7200), examStartedAt: startedAgo(7200) });
    const late = await call({ attemptId: 'a1', responses: { q1: { selectedOption: 'B' } } });
    expect(late.status).toBe(409);
    expect((await late.json()).reason).toBe('TIME_UP');

    testAttempt.findFirst.mockResolvedValue({ id: 'a1', startTime: startedAgo(10), examStartedAt: null });
    const early = await call({ attemptId: 'a1', responses: {} });
    expect((await early.json()).reason).toBe('NOT_STARTED');
    expect(testAttempt.update).not.toHaveBeenCalled();
  });

  it('rejects other roles, a foreign attempt, malformed and oversized bodies', async () => {
    getServerSession.mockResolvedValue({ user: { id: 'x', role: 'TEACHER' } });
    expect((await call({ attemptId: 'a1', responses: {} })).status).toBe(403);
    getServerSession.mockResolvedValue({ user: { id: 's1', role: 'STUDENT' } });
    testAttempt.findFirst.mockResolvedValue(null);
    expect((await call({ attemptId: 'a1', responses: {} })).status).toBe(404);
    expect((await call('{not json')).status).toBe(400);
    expect((await call({ attemptId: 'a1', responses: [1] })).status).toBe(400);
    expect((await call(JSON.stringify({ attemptId: 'a1', responses: { big: 'x'.repeat(1_100_000) } }))).status).toBe(413);
  });
});
