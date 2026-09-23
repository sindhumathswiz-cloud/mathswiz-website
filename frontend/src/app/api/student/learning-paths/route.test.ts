import { beforeEach, describe, expect, it, vi } from 'vitest';

const getServerSession = vi.fn();
const question = { findMany: vi.fn() };
const learningPathProgress = { findMany: vi.fn() };
const user = { findUnique: vi.fn() };
const batchEnrollment = { count: vi.fn() };

vi.mock('next-auth', () => ({ getServerSession }));
vi.mock('@/lib/auth', () => ({ authOptions: {} }));
vi.mock('@/lib/prisma', () => ({ default: { question, learningPathProgress, user, batchEnrollment } }));

describe('GET /api/student/learning-paths', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getServerSession.mockResolvedValue({ user: { id: 'student-1', role: 'STUDENT' } });
    // Happy-path curriculum gate: enrolled with a class set, matching every
    // pre-existing test's assumption that paths are visible.
    user.findUnique.mockResolvedValue({ class: 'Class 12' });
    batchEnrollment.count.mockResolvedValue(1);
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

  it('scopes the topic query to the student\'s own class', async () => {
    user.findUnique.mockResolvedValue({ class: 'Class 10' });
    question.findMany.mockResolvedValue([]);
    learningPathProgress.findMany.mockResolvedValue([]);
    const { GET } = await import('./route');
    await GET();
    expect(question.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ class: 'Class 10' }) }));
  });

  it('returns no paths for a student with no class set', async () => {
    user.findUnique.mockResolvedValue({ class: null });
    const { GET } = await import('./route');
    const response = await GET();
    const body = await response.json();
    expect(body.paths).toEqual([]);
    expect(question.findMany).not.toHaveBeenCalled();
  });

  it('returns no paths for a student not enrolled in any approved batch', async () => {
    batchEnrollment.count.mockResolvedValue(0);
    const { GET } = await import('./route');
    const response = await GET();
    const body = await response.json();
    expect(body.paths).toEqual([]);
    expect(question.findMany).not.toHaveBeenCalled();
  });
});
