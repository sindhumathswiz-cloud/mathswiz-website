import { beforeEach, describe, expect, it, vi } from 'vitest';

const getServerSession = vi.fn();
const learningPathProgress = { findUnique: vi.fn(), upsert: vi.fn() };
const question = { count: vi.fn() };

vi.mock('next-auth', () => ({ getServerSession }));
vi.mock('@/lib/auth', () => ({ authOptions: {} }));
vi.mock('@/lib/prisma', () => ({ default: { learningPathProgress, question } }));

const params = (topic: string) => Promise.resolve({ topic });
function post(topic: string, body: unknown) {
  return { req: new Request(`http://localhost/api/student/learning-paths/${topic}/examples/view`, { method: 'POST', body: JSON.stringify(body) }), params: params(topic) };
}

describe('POST /api/student/learning-paths/[topic]/examples/view', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getServerSession.mockResolvedValue({ user: { id: 'student-1', role: 'STUDENT' } });
    learningPathProgress.upsert.mockImplementation(({ create, update }: any) => Promise.resolve({ ...create, ...update }));
  });

  it('rejects non-student roles', async () => {
    getServerSession.mockResolvedValue({ user: { id: 'teacher-1', role: 'TEACHER' } });
    const { POST } = await import('./route');
    const { req, params: p } = post('Algebra', { questionId: 'q-1' });
    const response = await POST(req, { params: p });
    expect(response.status).toBe(401);
  });

  it('stays EXAMPLES under the (clamped) threshold', async () => {
    learningPathProgress.findUnique.mockResolvedValue(null);
    question.count.mockResolvedValue(5);
    const { POST } = await import('./route');
    const { req, params: p } = post('Algebra', { questionId: 'q-1' });
    const response = await POST(req, { params: p });
    const body = await response.json();
    expect(body.progress.stage).toBe('EXAMPLES');
    expect(body.progress.examplesViewedCount).toBe(1);
  });

  it('advances to GUIDED_PRACTICE once the 3rd distinct example is viewed', async () => {
    learningPathProgress.findUnique.mockResolvedValue({
      stage: 'EXAMPLES', examplesViewedIds: ['q-1', 'q-2'], examplesViewedCount: 2,
    });
    question.count.mockResolvedValue(5);
    const { POST } = await import('./route');
    const { req, params: p } = post('Algebra', { questionId: 'q-3' });
    const response = await POST(req, { params: p });
    const body = await response.json();
    expect(body.progress.stage).toBe('GUIDED_PRACTICE');
    expect(body.progress.examplesViewedCount).toBe(3);
  });

  it('does not double-count re-viewing an already-viewed question', async () => {
    learningPathProgress.findUnique.mockResolvedValue({
      stage: 'EXAMPLES', examplesViewedIds: ['q-1', 'q-2'], examplesViewedCount: 2,
    });
    question.count.mockResolvedValue(5);
    const { POST } = await import('./route');
    const { req, params: p } = post('Algebra', { questionId: 'q-1' });
    const response = await POST(req, { params: p });
    const body = await response.json();
    expect(body.progress.examplesViewedCount).toBe(2);
    expect(body.progress.stage).toBe('EXAMPLES');
  });

  it('clamps the required count for a sparse topic (only 1 example exists)', async () => {
    learningPathProgress.findUnique.mockResolvedValue(null);
    question.count.mockResolvedValue(1);
    const { POST } = await import('./route');
    const { req, params: p } = post('RareTopic', { questionId: 'q-only' });
    const response = await POST(req, { params: p });
    const body = await response.json();
    expect(body.progress.stage).toBe('GUIDED_PRACTICE');
  });

  it('400s when the path is already past the examples stage', async () => {
    learningPathProgress.findUnique.mockResolvedValue({ stage: 'GUIDED_PRACTICE', examplesViewedIds: [], examplesViewedCount: 3 });
    const { POST } = await import('./route');
    const { req, params: p } = post('Algebra', { questionId: 'q-1' });
    const response = await POST(req, { params: p });
    expect(response.status).toBe(400);
  });
});
