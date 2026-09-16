import { beforeEach, describe, expect, it, vi } from 'vitest';

const getServerSession = vi.fn();
const learningPathProgress = { findUnique: vi.fn(), update: vi.fn() };
const masteryEvent = { findFirst: vi.fn() };

vi.mock('next-auth', () => ({ getServerSession }));
vi.mock('@/lib/auth', () => ({ authOptions: {} }));
vi.mock('@/lib/prisma', () => ({ default: { learningPathProgress, masteryEvent } }));

const params = (topic: string) => Promise.resolve({ topic });

describe('GET /api/student/learning-paths/[topic]/recovery-status', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getServerSession.mockResolvedValue({ user: { id: 'student-1', role: 'STUDENT' } });
    learningPathProgress.update.mockImplementation(({ data }: any) => Promise.resolve({ stage: 'RECOVERY_PRACTICE', ...data }));
  });

  it('404s when there is no progress row for the topic', async () => {
    learningPathProgress.findUnique.mockResolvedValue(null);
    const { GET } = await import('./route');
    const response = await GET(new Request('http://localhost'), { params: params('Algebra') });
    expect(response.status).toBe(404);
  });

  it('drops a question that has since been answered correctly', async () => {
    learningPathProgress.findUnique.mockResolvedValue({ stage: 'RECOVERY_PRACTICE', recoveryQuestionIds: ['q-1', 'q-2'] });
    masteryEvent.findFirst.mockImplementation(({ where }: any) =>
      Promise.resolve(where.questionId === 'q-1' ? { isCorrect: true } : { isCorrect: false }));
    const { GET } = await import('./route');
    const response = await GET(new Request('http://localhost'), { params: params('Algebra') });
    const body = await response.json();
    expect(body.progress.recoveryQuestionIds).toEqual(['q-2']);
    expect(body.progress.stage).toBe('RECOVERY_PRACTICE');
  });

  it('completes the path once every recovery mistake is cleared', async () => {
    learningPathProgress.findUnique.mockResolvedValue({ stage: 'RECOVERY_PRACTICE', recoveryQuestionIds: ['q-1'] });
    masteryEvent.findFirst.mockResolvedValue({ isCorrect: true });
    const { GET } = await import('./route');
    const response = await GET(new Request('http://localhost'), { params: params('Algebra') });
    const body = await response.json();
    expect(body.progress.stage).toBe('COMPLETED');
  });

  it('is a pass-through when the path is not in RECOVERY_PRACTICE', async () => {
    learningPathProgress.findUnique.mockResolvedValue({ stage: 'COMPLETED', recoveryQuestionIds: [] });
    const { GET } = await import('./route');
    const response = await GET(new Request('http://localhost'), { params: params('Algebra') });
    const body = await response.json();
    expect(body.progress.stage).toBe('COMPLETED');
    expect(learningPathProgress.update).not.toHaveBeenCalled();
  });
});
