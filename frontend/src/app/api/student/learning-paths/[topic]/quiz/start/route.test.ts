import { beforeEach, describe, expect, it, vi } from 'vitest';

const getServerSession = vi.fn();
const learningPathProgress = { findUnique: vi.fn() };
const question = { findMany: vi.fn() };

vi.mock('next-auth', () => ({ getServerSession }));
vi.mock('@/lib/auth', () => ({ authOptions: {} }));
vi.mock('@/lib/prisma', () => ({ default: { learningPathProgress, question } }));

const params = (topic: string) => Promise.resolve({ topic });

describe('POST /api/student/learning-paths/[topic]/quiz/start', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getServerSession.mockResolvedValue({ user: { id: 'student-1', role: 'STUDENT' } });
  });

  it('400s if the path has not reached the quiz stage', async () => {
    learningPathProgress.findUnique.mockResolvedValue({ stage: 'GUIDED_PRACTICE' });
    const { POST } = await import('./route');
    const response = await POST(new Request('http://localhost', { method: 'POST' }), { params: params('Algebra') });
    expect(response.status).toBe(400);
  });

  it('422s when there are too few questions for a quiz', async () => {
    learningPathProgress.findUnique.mockResolvedValue({ stage: 'TIMED_QUIZ' });
    question.findMany.mockResolvedValue([{ id: 'q-1' }, { id: 'q-2' }]);
    const { POST } = await import('./route');
    const response = await POST(new Request('http://localhost', { method: 'POST' }), { params: params('Algebra') });
    expect(response.status).toBe(422);
  });

  it('returns a shuffled question set within the quiz length', async () => {
    learningPathProgress.findUnique.mockResolvedValue({ stage: 'TIMED_QUIZ' });
    question.findMany.mockResolvedValue(Array.from({ length: 8 }, (_, i) => ({ id: `q-${i}` })));
    const { POST } = await import('./route');
    const response = await POST(new Request('http://localhost', { method: 'POST' }), { params: params('Algebra') });
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.questions.length).toBeLessThanOrEqual(8);
    expect(body.startedAt).toBeTruthy();
  });
});
