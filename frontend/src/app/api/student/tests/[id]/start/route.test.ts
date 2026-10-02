import { beforeEach, describe, expect, it, vi } from 'vitest';

const getServerSession = vi.fn();
const testAssignment = { findFirst: vi.fn() };
const testAttempt = { count: vi.fn(), findFirst: vi.fn(), create: vi.fn() };
const test = { findUnique: vi.fn() };
const user = { findUnique: vi.fn() };

vi.mock('next-auth', () => ({ getServerSession }));
vi.mock('@/lib/auth', () => ({ authOptions: {} }));
vi.mock('@/lib/prisma', () => ({ default: { testAssignment, testAttempt, test, user } }));

describe('student assignment start', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getServerSession.mockResolvedValue({ user: { id: 'student-1', role: 'STUDENT' } });
    testAssignment.findFirst.mockResolvedValue({ id: 'assignment-1', maxAttempts: 1 });
    testAttempt.count.mockResolvedValue(0);
    test.findUnique.mockResolvedValue({ id: 'test-1', sections: [] });
    testAttempt.findFirst.mockResolvedValue(null);
    testAttempt.create.mockResolvedValue({ id: 'attempt-1' });
    // Premium by default so the pre-existing tests below (written before the
    // free-preview gate existed) keep exercising unrestricted access; the
    // gate itself gets its own dedicated tests below.
    user.findUnique.mockResolvedValue({ subscription: 'PREMIUM' });
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

  describe('free-preview gating for non-premium students', () => {
    beforeEach(() => {
      user.findUnique.mockResolvedValue({ subscription: 'FREE' });
    });

    it('blocks a test with no questions at all', async () => {
      test.findUnique.mockResolvedValue({ id: 'test-1', sections: [] });
      const response = await start();
      expect(response.status).toBe(403);
      expect(await response.json()).toEqual(expect.objectContaining({ error: expect.stringContaining('premium subscription') }));
      expect(testAttempt.create).not.toHaveBeenCalled();
    });

    it('blocks a test containing even one non-free-preview question', async () => {
      test.findUnique.mockResolvedValue({
        id: 'test-1',
        sections: [{ questions: [
          { question: { topic: 'Sets', class: 'Class 11', bookChapter: null } },
          { question: { topic: 'Integrals', class: 'Class 12', bookChapter: { orderIndex: 3 } } },
        ] }],
      });
      const response = await start();
      expect(response.status).toBe(403);
      expect(testAttempt.create).not.toHaveBeenCalled();
    });

    it('allows a test made entirely of free-preview-eligible questions', async () => {
      test.findUnique.mockResolvedValue({
        id: 'test-1',
        sections: [{ questions: [{ question: { topic: 'Sets', class: 'Class 11', bookChapter: null } }] }],
      });
      const response = await start();
      expect(response.status).toBe(200);
      expect(testAttempt.create).toHaveBeenCalled();
    });
  });
});
