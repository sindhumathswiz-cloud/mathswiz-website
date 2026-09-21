import { beforeEach, describe, expect, it, vi } from 'vitest';

const getServerSession = vi.fn();
const spacedRepetitionCard = { findMany: vi.fn() };
const question = { findMany: vi.fn() };

vi.mock('next-auth', () => ({ getServerSession }));
vi.mock('@/lib/auth', () => ({ authOptions: {} }));
vi.mock('@/lib/prisma', () => ({ default: { spacedRepetitionCard, question } }));

const hoursAgo = (h: number) => new Date(Date.now() - h * 60 * 60 * 1000);
const hoursFromNow = (h: number) => new Date(Date.now() + h * 60 * 60 * 1000);

describe('student practice mistakes queue', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getServerSession.mockResolvedValue({ user: { id: 'student-1', role: 'STUDENT' } });
  });

  it('rejects non-student roles', async () => {
    getServerSession.mockResolvedValue({ user: { id: 'teacher-1', role: 'TEACHER' } });
    const { GET } = await import('./route');
    const response = await GET(new Request('http://localhost/api/student/practice/mistakes'));
    expect(response.status).toBe(401);
    expect(spacedRepetitionCard.findMany).not.toHaveBeenCalled();
  });

  it('scope=due excludes a card not yet due', async () => {
    spacedRepetitionCard.findMany.mockResolvedValue([
      { questionId: 'q-recent', lapses: 1, lastReviewedAt: hoursAgo(1), createdAt: hoursAgo(1), dueAt: hoursFromNow(23) },
    ]);
    const { GET } = await import('./route');
    const response = await GET(new Request('http://localhost/api/student/practice/mistakes'));
    const body = await response.json();
    expect(body.questions).toEqual([]);
    expect(question.findMany).not.toHaveBeenCalled();
  });

  it('scope=due returns a card once its dueAt has passed', async () => {
    spacedRepetitionCard.findMany.mockResolvedValue([
      { questionId: 'q-old', lapses: 1, lastReviewedAt: hoursAgo(200), createdAt: hoursAgo(200), dueAt: hoursAgo(1) },
    ]);
    question.findMany.mockResolvedValue([
      { id: 'q-old', topic: 'Algebra', options: ['1', '2'], correctAnswer: 'A' },
    ]);
    const { GET } = await import('./route');
    const response = await GET(new Request('http://localhost/api/student/practice/mistakes'));
    const body = await response.json();
    expect(body.questions).toHaveLength(1);
    expect(body.questions[0].id).toBe('q-old');
    expect(body.questions[0].missCount).toBe(1);
  });

  it('scope=all returns a card regardless of its due date', async () => {
    spacedRepetitionCard.findMany.mockResolvedValue([
      { questionId: 'q-recent', lapses: 1, lastReviewedAt: hoursAgo(1), createdAt: hoursAgo(1), dueAt: hoursFromNow(23) },
    ]);
    question.findMany.mockResolvedValue([
      { id: 'q-recent', topic: 'Algebra', options: ['1', '2'], correctAnswer: 'A' },
    ]);
    const { GET } = await import('./route');
    const response = await GET(new Request('http://localhost/api/student/practice/mistakes?scope=all'));
    const body = await response.json();
    expect(body.questions).toHaveLength(1);
  });

  it('topic query param filters results to that topic only', async () => {
    spacedRepetitionCard.findMany.mockResolvedValue([
      { questionId: 'q-algebra', lapses: 1, lastReviewedAt: hoursAgo(200), createdAt: hoursAgo(200), dueAt: hoursAgo(1) },
      { questionId: 'q-geometry', lapses: 1, lastReviewedAt: hoursAgo(200), createdAt: hoursAgo(200), dueAt: hoursAgo(1) },
    ]);
    question.findMany.mockResolvedValue([
      { id: 'q-algebra', topic: 'Algebra', options: ['1', '2'], correctAnswer: 'A' },
      { id: 'q-geometry', topic: 'Geometry', options: ['1', '2'], correctAnswer: 'A' },
    ]);
    const { GET } = await import('./route');
    const response = await GET(new Request('http://localhost/api/student/practice/mistakes?scope=all&topic=Algebra'));
    const body = await response.json();
    expect(body.questions).toHaveLength(1);
    expect(body.questions[0].id).toBe('q-algebra');
  });

  it('scope=all still includes a card whose most recent review was correct but not yet due (real SM-2, not the old vanish-on-correct behavior)', async () => {
    spacedRepetitionCard.findMany.mockResolvedValue([
      { questionId: 'q-recovering', lapses: 0, lastReviewedAt: hoursAgo(1), createdAt: hoursAgo(300), dueAt: hoursFromNow(150) },
    ]);
    question.findMany.mockResolvedValue([
      { id: 'q-recovering', topic: 'Algebra', options: ['1', '2'], correctAnswer: 'A' },
    ]);
    const { GET } = await import('./route');
    const response = await GET(new Request('http://localhost/api/student/practice/mistakes?scope=all'));
    const body = await response.json();
    expect(body.questions).toHaveLength(1);
    expect(body.questions[0].missCount).toBe(0);
    expect(spacedRepetitionCard.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { userId: 'student-1', questionId: { not: null } },
    }));
  });
});
