import { beforeEach, describe, expect, it, vi } from 'vitest';

const getServerSession = vi.fn();
const masteryEvent = { findMany: vi.fn() };
const question = { findMany: vi.fn() };

vi.mock('next-auth', () => ({ getServerSession }));
vi.mock('@/lib/auth', () => ({ authOptions: {} }));
vi.mock('@/lib/prisma', () => ({ default: { masteryEvent, question } }));

const hoursAgo = (h: number) => new Date(Date.now() - h * 60 * 60 * 1000);

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
    expect(masteryEvent.findMany).not.toHaveBeenCalled();
  });

  it('scope=due excludes a mistake still inside its backoff window', async () => {
    masteryEvent.findMany.mockResolvedValue([
      { questionId: 'q-recent', isCorrect: false, createdAt: hoursAgo(1) }, // 4h interval, not due
    ]);
    const { GET } = await import('./route');
    const response = await GET(new Request('http://localhost/api/student/practice/mistakes'));
    const body = await response.json();
    expect(body.questions).toEqual([]);
    expect(question.findMany).not.toHaveBeenCalled();
  });

  it('scope=due returns a question once its backoff window has elapsed', async () => {
    masteryEvent.findMany.mockResolvedValue([
      { questionId: 'q-old', isCorrect: false, createdAt: hoursAgo(200) },
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

  it('scope=all returns a mistake regardless of backoff window', async () => {
    masteryEvent.findMany.mockResolvedValue([
      { questionId: 'q-recent', isCorrect: false, createdAt: hoursAgo(1) },
    ]);
    question.findMany.mockResolvedValue([
      { id: 'q-recent', topic: 'Algebra', options: ['1', '2'], correctAnswer: 'A' },
    ]);
    const { GET } = await import('./route');
    const response = await GET(new Request('http://localhost/api/student/practice/mistakes?scope=all'));
    const body = await response.json();
    expect(body.questions).toHaveLength(1);
  });

  it('excludes a question the student has since answered correctly', async () => {
    masteryEvent.findMany.mockResolvedValue([
      { questionId: 'q-fixed', isCorrect: false, createdAt: hoursAgo(200) },
      { questionId: 'q-fixed', isCorrect: true, createdAt: hoursAgo(1) },
    ]);
    const { GET } = await import('./route');
    const response = await GET(new Request('http://localhost/api/student/practice/mistakes?scope=all'));
    const body = await response.json();
    expect(body.questions).toEqual([]);
    expect(question.findMany).not.toHaveBeenCalled();
  });
});
