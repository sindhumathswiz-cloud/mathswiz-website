import { beforeEach, describe, expect, it, vi } from 'vitest';

const getServerSession = vi.fn();
const learningPathProgress = { findUnique: vi.fn(), update: vi.fn() };

vi.mock('next-auth', () => ({ getServerSession }));
vi.mock('@/lib/auth', () => ({ authOptions: {} }));
vi.mock('@/lib/prisma', () => ({ default: { learningPathProgress } }));

const params = (topic: string) => Promise.resolve({ topic });
function post(topic: string, body: unknown) {
  return { req: new Request(`http://localhost/api/student/learning-paths/${topic}/guided/record`, { method: 'POST', body: JSON.stringify(body) }), params: params(topic) };
}

describe('POST /api/student/learning-paths/[topic]/guided/record', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getServerSession.mockResolvedValue({ user: { id: 'student-1', role: 'STUDENT' } });
    learningPathProgress.update.mockImplementation(({ data }: any) => Promise.resolve({ stage: 'GUIDED_PRACTICE', ...data }));
  });

  it('400s if the path has not reached guided practice (still in EXAMPLES)', async () => {
    learningPathProgress.findUnique.mockResolvedValue({ stage: 'EXAMPLES', guidedAttempted: 0, guidedCorrect: 0 });
    const { POST } = await import('./route');
    const { req, params: p } = post('Algebra', { isCorrect: true });
    const response = await POST(req, { params: p });
    expect(response.status).toBe(400);
    expect(learningPathProgress.update).not.toHaveBeenCalled();
  });

  it('stays in GUIDED_PRACTICE under the minimum attempts even at 100% accuracy', async () => {
    learningPathProgress.findUnique.mockResolvedValue({ stage: 'GUIDED_PRACTICE', guidedAttempted: 3, guidedCorrect: 3 });
    const { POST } = await import('./route');
    const { req, params: p } = post('Algebra', { isCorrect: true });
    const response = await POST(req, { params: p });
    const body = await response.json();
    expect(body.progress.stage).toBe('GUIDED_PRACTICE');
  });

  it('advances to TIMED_QUIZ once attempts and accuracy thresholds are both met', async () => {
    learningPathProgress.findUnique.mockResolvedValue({ stage: 'GUIDED_PRACTICE', guidedAttempted: 4, guidedCorrect: 3 });
    const { POST } = await import('./route');
    const { req, params: p } = post('Algebra', { isCorrect: true });
    const response = await POST(req, { params: p });
    const body = await response.json();
    // 5 attempted, 4 correct => 0.8 accuracy, meets both thresholds
    expect(body.progress.stage).toBe('TIMED_QUIZ');
  });

  it('is a no-op (200) when already past GUIDED_PRACTICE', async () => {
    learningPathProgress.findUnique.mockResolvedValue({ stage: 'TIMED_QUIZ', guidedAttempted: 5, guidedCorrect: 4 });
    const { POST } = await import('./route');
    const { req, params: p } = post('Algebra', { isCorrect: true });
    const response = await POST(req, { params: p });
    expect(response.status).toBe(200);
    expect(learningPathProgress.update).not.toHaveBeenCalled();
  });
});
