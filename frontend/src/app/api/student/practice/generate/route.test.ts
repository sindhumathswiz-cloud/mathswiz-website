import { beforeEach, describe, expect, it, vi } from 'vitest';

const getServerSession = vi.fn();
const user = { findUnique: vi.fn(), update: vi.fn() };
const question = { findMany: vi.fn(), create: vi.fn() };
const studentProgress = { findFirst: vi.fn() };
const knowledgeDocument = { findMany: vi.fn() };
const knowledgeFolder = { findMany: vi.fn() };

vi.mock('next-auth', () => ({ getServerSession }));
vi.mock('@/lib/auth', () => ({ authOptions: {} }));
vi.mock('@/lib/prisma', () => ({
  default: { user, question, studentProgress, knowledgeDocument, knowledgeFolder },
}));

function post(body: any) {
  return new Request('http://localhost/api/student/practice/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('POST /api/student/practice/generate -- mastery-weighted difficulty', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getServerSession.mockResolvedValue({ user: { id: 'student-1' } });
    user.findUnique.mockResolvedValue({ id: 'student-1', role: 'STUDENT', subscription: 'FREE', aiTokens: 5 });
    studentProgress.findFirst.mockResolvedValue(null);
    // Enough bank questions to satisfy the request, so these tests exercise
    // just the DB-first query and its difficulty band -- no LLM call needed.
    question.findMany.mockResolvedValue([{ id: 'q-1' }, { id: 'q-2' }, { id: 'q-3' }, { id: 'q-4' }, { id: 'q-5' }]);
  });

  it('rejects unauthenticated callers', async () => {
    getServerSession.mockResolvedValue({ user: {} });
    const { POST } = await import('./route');
    const response = await POST(post({ topic: 'Algebra' }));
    expect(response.status).toBe(401);
  });

  it('derives a low-mastery band (EASY only) from an existing weak StudentProgress row', async () => {
    studentProgress.findFirst.mockResolvedValue({ masteryScore: 10 });
    const { POST } = await import('./route');
    await POST(post({ topic: 'Algebra', count: 5 }));

    expect(question.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ difficulty: { in: ['EASY'] } }),
    }));
  });

  it('derives a mid band (EASY+MEDIUM) from a mid-mastery StudentProgress row', async () => {
    studentProgress.findFirst.mockResolvedValue({ masteryScore: 40 });
    const { POST } = await import('./route');
    await POST(post({ topic: 'Algebra', count: 5 }));

    expect(question.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ difficulty: { in: ['EASY', 'MEDIUM'] } }),
    }));
  });

  it('defaults to mastery score 50 (EASY+MEDIUM band) when no StudentProgress row exists yet', async () => {
    studentProgress.findFirst.mockResolvedValue(null);
    const { POST } = await import('./route');
    await POST(post({ topic: 'Algebra', count: 5 }));

    expect(question.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ difficulty: { in: ['EASY', 'MEDIUM'] } }),
    }));
  });

  it('uses an explicit difficulty as-is and skips the mastery lookup entirely', async () => {
    const { POST } = await import('./route');
    await POST(post({ topic: 'Algebra', difficulty: 'hard', count: 5 }));

    expect(studentProgress.findFirst).not.toHaveBeenCalled();
    expect(question.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ difficulty: { in: ['HARD'] } }),
    }));
  });
});
