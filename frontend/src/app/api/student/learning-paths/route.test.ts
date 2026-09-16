import { beforeEach, describe, expect, it, vi } from 'vitest';

const getServerSession = vi.fn();
const question = { findMany: vi.fn() };
const learningPathProgress = { findMany: vi.fn() };

vi.mock('next-auth', () => ({ getServerSession }));
vi.mock('@/lib/auth', () => ({ authOptions: {} }));
vi.mock('@/lib/prisma', () => ({ default: { question, learningPathProgress } }));

describe('GET /api/student/learning-paths', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getServerSession.mockResolvedValue({ user: { id: 'student-1', role: 'STUDENT' } });
  });

  it('rejects non-student roles', async () => {
    getServerSession.mockResolvedValue({ user: { id: 'teacher-1', role: 'TEACHER' } });
    const { GET } = await import('./route');
    const response = await GET();
    expect(response.status).toBe(401);
  });

  it('synthesizes a default EXAMPLES stage for a topic with no progress row', async () => {
    question.findMany.mockResolvedValue([{ topic: 'Algebra' }]);
    learningPathProgress.findMany.mockResolvedValue([]);
    const { GET } = await import('./route');
    const response = await GET();
    const body = await response.json();
    expect(body.paths).toEqual([expect.objectContaining({ topic: 'Algebra', stage: 'EXAMPLES' })]);
  });

  it('merges an existing progress row', async () => {
    question.findMany.mockResolvedValue([{ topic: 'Algebra' }]);
    learningPathProgress.findMany.mockResolvedValue([
      { topic: 'Algebra', stage: 'TIMED_QUIZ', examplesViewedCount: 3, guidedAttempted: 5, guidedCorrect: 4, quizScore: null, recoveryQuestionIds: [], startedAt: new Date(), completedAt: null },
    ]);
    const { GET } = await import('./route');
    const response = await GET();
    const body = await response.json();
    expect(body.paths[0].stage).toBe('TIMED_QUIZ');
    expect(body.paths[0].guidedAttempted).toBe(5);
  });
});
