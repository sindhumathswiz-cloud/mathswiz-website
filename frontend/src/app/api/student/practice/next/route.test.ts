import { beforeEach, describe, expect, it, vi } from 'vitest';

const getServerSession = vi.fn();
const question = { findMany: vi.fn() };
const studentProgress = { findMany: vi.fn() };

vi.mock('next-auth', () => ({ getServerSession }));
vi.mock('@/lib/auth', () => ({ authOptions: {} }));
vi.mock('@/lib/prisma', () => ({ default: { question, studentProgress } }));

describe('adaptive Arena next question', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getServerSession.mockResolvedValue({ user: { id: 'student-1', role: 'STUDENT' } });
    studentProgress.findMany.mockResolvedValue([]);
  });

  it('filters malformed candidates and returns normalized usable options', async () => {
    question.findMany.mockResolvedValue([
      { id: 'bad', options: '["truncated"', correctAnswer: 'A' },
      { id: 'subjective', options: [], correctAnswer: '4' },
      { id: 'conflict', options: ['1', '2'], correctAnswer: 'B', explanation: 'The correct answer is option A.' },
      { id: 'good', options: '["3","4","5","6"]', correctAnswer: 'B' },
    ]);
    const { GET } = await import('./route');
    const response = await GET(new Request('http://localhost/api/student/practice/next'));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.question.id).toBe('good');
    expect(body.question.options).toEqual(['3', '4', '5', '6']);
  });

  it('returns 404 when no interactive question is usable', async () => {
    question.findMany.mockResolvedValue([{ id: 'bad', options: '', correctAnswer: 'A' }]);
    const { GET } = await import('./route');
    const response = await GET(new Request('http://localhost/api/student/practice/next'));
    expect(response.status).toBe(404);
  });

  it('rejects non-student roles', async () => {
    getServerSession.mockResolvedValue({ user: { id: 'teacher-1', role: 'TEACHER' } });
    const { GET } = await import('./route');
    const response = await GET(new Request('http://localhost/api/student/practice/next'));
    expect(response.status).toBe(401);
    expect(question.findMany).not.toHaveBeenCalled();
  });

  it('weights selection toward the topic with the lowest mastery over many draws', async () => {
    question.findMany.mockResolvedValue([
      { id: 'weak-topic', topic: 'Weak', difficulty: 'EASY', options: ['1', '2'], correctAnswer: 'A' },
      { id: 'strong-topic', topic: 'Strong', difficulty: 'EASY', options: ['1', '2'], correctAnswer: 'A' },
    ]);
    studentProgress.findMany.mockResolvedValue([
      { topic: 'Weak', masteryScore: 10 },
      { topic: 'Strong', masteryScore: 95 },
    ]);

    const counts: Record<string, number> = { 'weak-topic': 0, 'strong-topic': 0 };
    const { GET } = await import('./route');
    for (let i = 0; i < 200; i++) {
      const response = await GET(new Request('http://localhost/api/student/practice/next'));
      const body = await response.json();
      counts[body.question.id] += 1;
    }
    expect(counts['weak-topic']).toBeGreaterThan(counts['strong-topic']);
  });

  it('does not fail the request when the mastery lookup errors', async () => {
    question.findMany.mockResolvedValue([
      { id: 'good', topic: 'Algebra', difficulty: 'EASY', options: ['1', '2'], correctAnswer: 'A' },
    ]);
    studentProgress.findMany.mockRejectedValue(new Error('db unavailable'));
    const { GET } = await import('./route');
    const response = await GET(new Request('http://localhost/api/student/practice/next'));
    expect(response.status).toBe(200);
  });

  it('an explicit topic filter still returns the only matching question', async () => {
    question.findMany.mockResolvedValue([
      { id: 'only-match', topic: 'Trigonometry', difficulty: 'HARD', options: ['1', '2'], correctAnswer: 'A' },
    ]);
    const { GET } = await import('./route');
    const response = await GET(new Request('http://localhost/api/student/practice/next?topic=Trigonometry'));
    const body = await response.json();
    expect(body.question.id).toBe('only-match');
    expect(question.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ topic: 'Trigonometry' }),
    }));
  });
});
