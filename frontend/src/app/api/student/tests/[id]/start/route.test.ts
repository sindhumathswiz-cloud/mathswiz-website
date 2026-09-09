import { beforeEach, describe, expect, it, vi } from 'vitest';

const getServerSession = vi.fn();
const testAssignment = { findFirst: vi.fn() };
const testAttempt = { count: vi.fn(), findFirst: vi.fn(), create: vi.fn() };
const test = { findUnique: vi.fn() };

vi.mock('next-auth', () => ({ getServerSession }));
vi.mock('@/lib/auth', () => ({ authOptions: {} }));
vi.mock('@/lib/prisma', () => ({ default: { testAssignment, testAttempt, test } }));

describe('student assignment start', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getServerSession.mockResolvedValue({ user: { id: 'student-1', role: 'STUDENT' } });
    testAssignment.findFirst.mockResolvedValue({ id: 'assignment-1', maxAttempts: 1 });
    testAttempt.count.mockResolvedValue(0);
    test.findUnique.mockResolvedValue({ id: 'test-1', sections: [] });
    testAttempt.findFirst.mockResolvedValue(null);
    testAttempt.create.mockResolvedValue({ id: 'attempt-1' });
  });

  async function start() {
    const { GET } = await import('./route');
    return GET(new Request('http://localhost/api/student/tests/test-1/start'), {
      params: Promise.resolve({ id: 'test-1' }),
    });
  }

  it('starts assigned work when attempts remain', async () => {
    expect((await start()).status).toBe(200);
    expect(testAttempt.create).toHaveBeenCalledWith({
      data: { testId: 'test-1', userId: 'student-1', status: 'IN_PROGRESS' },
    });
  });

  it('blocks work after the maximum attempts', async () => {
    testAttempt.count.mockResolvedValue(1);
    const response = await start();
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: 'Maximum attempts reached' });
    expect(test.findUnique).not.toHaveBeenCalled();
  });
});
