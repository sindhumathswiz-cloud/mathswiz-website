import { beforeEach, describe, expect, it, vi } from 'vitest';

const getServerSession = vi.fn();
const learningPathProgress = { findUnique: vi.fn(), update: vi.fn() };
const masteryEvent = { findMany: vi.fn() };

vi.mock('next-auth', () => ({ getServerSession }));
vi.mock('@/lib/auth', () => ({ authOptions: {} }));
vi.mock('@/lib/prisma', () => ({ default: { learningPathProgress, masteryEvent } }));

const params = (topic: string) => Promise.resolve({ topic });
function post(topic: string, body: unknown) {
  return { req: new Request(`http://localhost/api/student/learning-paths/${topic}/quiz/complete`, { method: 'POST', body: JSON.stringify(body) }), params: params(topic) };
}

const startedAt = new Date('2026-09-16T10:00:00Z').toISOString();

describe('POST /api/student/learning-paths/[topic]/quiz/complete', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getServerSession.mockResolvedValue({ user: { id: 'student-1', role: 'STUDENT' } });
    learningPathProgress.findUnique.mockResolvedValue({ stage: 'TIMED_QUIZ' });
    learningPathProgress.update.mockImplementation(({ data }: any) => Promise.resolve({ stage: 'TIMED_QUIZ', ...data }));
  });

  it('400s if the path has not reached the quiz stage', async () => {
    learningPathProgress.findUnique.mockResolvedValue({ stage: 'GUIDED_PRACTICE' });
    const { POST } = await import('./route');
    const { req, params: p } = post('Algebra', { questionIds: ['q-1'], startedAt });
    const response = await POST(req, { params: p });
    expect(response.status).toBe(400);
  });

  it('recomputes the score from server-side MasteryEvent rows, ignoring a manipulated client payload', async () => {
    // Client claims all 3 correct, but the server's own recorded events (from
    // the practice/submit calls that actually ran during the quiz) show 2 misses.
    masteryEvent.findMany.mockResolvedValue([
      { questionId: 'q-1', isCorrect: true, createdAt: new Date('2026-09-16T10:01:00Z') },
      { questionId: 'q-2', isCorrect: false, createdAt: new Date('2026-09-16T10:02:00Z') },
      { questionId: 'q-3', isCorrect: false, createdAt: new Date('2026-09-16T10:03:00Z') },
    ]);
    const { POST } = await import('./route');
    const { req, params: p } = post('Algebra', {
      questionIds: ['q-1', 'q-2', 'q-3'],
      startedAt,
      results: [{ questionId: 'q-1', isCorrect: true }, { questionId: 'q-2', isCorrect: true }, { questionId: 'q-3', isCorrect: true }],
    });
    const response = await POST(req, { params: p });
    const body = await response.json();
    expect(body.correctCount).toBe(1);
    expect(body.progress.quizScore).toBeCloseTo(33.3, 1);
    expect(body.progress.recoveryQuestionIds).toEqual(expect.arrayContaining(['q-2', 'q-3']));
    expect(body.progress.stage).toBe('RECOVERY_PRACTICE');
  });

  it('goes straight to COMPLETED with zero misses', async () => {
    masteryEvent.findMany.mockResolvedValue([
      { questionId: 'q-1', isCorrect: true, createdAt: new Date('2026-09-16T10:01:00Z') },
    ]);
    const { POST } = await import('./route');
    const { req, params: p } = post('Algebra', { questionIds: ['q-1'], startedAt });
    const response = await POST(req, { params: p });
    const body = await response.json();
    expect(body.progress.stage).toBe('COMPLETED');
    expect(body.progress.recoveryQuestionIds).toEqual([]);
  });

  it('treats an unanswered question as a miss', async () => {
    masteryEvent.findMany.mockResolvedValue([]);
    const { POST } = await import('./route');
    const { req, params: p } = post('Algebra', { questionIds: ['q-1', 'q-2'], startedAt });
    const response = await POST(req, { params: p });
    const body = await response.json();
    expect(body.correctCount).toBe(0);
    expect(body.progress.recoveryQuestionIds).toEqual(['q-1', 'q-2']);
  });

  it('uses only the latest event per question when a question was retried', async () => {
    masteryEvent.findMany.mockResolvedValue([
      // findMany is ordered desc by createdAt in the route; simulate that here.
      { questionId: 'q-1', isCorrect: true, createdAt: new Date('2026-09-16T10:05:00Z') },
      { questionId: 'q-1', isCorrect: false, createdAt: new Date('2026-09-16T10:01:00Z') },
    ]);
    const { POST } = await import('./route');
    const { req, params: p } = post('Algebra', { questionIds: ['q-1'], startedAt });
    const response = await POST(req, { params: p });
    const body = await response.json();
    expect(body.correctCount).toBe(1);
  });
});
