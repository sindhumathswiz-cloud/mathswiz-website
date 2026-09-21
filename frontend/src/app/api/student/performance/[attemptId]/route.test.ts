import { beforeEach, describe, expect, it, vi } from 'vitest';

const getServerSession = vi.fn();
const testAttempt = { findFirst: vi.fn(), count: vi.fn() };
const testResponse = { groupBy: vi.fn() };
const masteryEvent = { findMany: vi.fn() };
const studentProgress = { findFirst: vi.fn() };

vi.mock('next-auth', () => ({ getServerSession }));
vi.mock('@/lib/auth', () => ({ authOptions: {} }));
vi.mock('@/lib/prisma', () => ({ default: { testAttempt, testResponse, masteryEvent, studentProgress } }));

const baseAttempt = {
  id: 'attempt-1',
  testId: 'test-1',
  totalScore: 4,
  totalCorrect: 1,
  totalIncorrect: 1,
  totalSkipped: 0,
  responses: [
    { id: 'r-correct', questionId: 'q-1', isCorrect: true, status: 'ANSWERED', selectedOption: 'A', timeSpent: 30, question: { topic: 'Algebra' } },
    { id: 'r-wrong', questionId: 'q-2', isCorrect: false, status: 'ANSWERED', selectedOption: 'C', timeSpent: 30, question: { topic: 'Geometry' } },
  ],
};

async function call() {
  const { GET } = await import('./route');
  return GET(new Request('http://localhost/api/student/performance/attempt-1'), { params: Promise.resolve({ attemptId: 'attempt-1' }) });
}

describe('GET /api/student/performance/[attemptId] -- insights and recommended action', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getServerSession.mockResolvedValue({ user: { id: 'student-1', role: 'STUDENT' } });
    testAttempt.findFirst.mockResolvedValue(baseAttempt);
    testAttempt.count.mockResolvedValue(0);
    testResponse.groupBy.mockResolvedValue([]);
    masteryEvent.findMany.mockResolvedValue([]);
    studentProgress.findFirst.mockResolvedValue(null);
  });

  it('classifies a common wrong pick as COMMON_MISTAKE using the groupBy count', async () => {
    testResponse.groupBy.mockResolvedValue([
      { questionId: 'q-2', selectedOption: 'C', _count: { _all: 4 } },
    ]);
    const body = await (await call()).json();

    const wrongInsight = body.responseInsights.find((r: any) => r.responseId === 'r-wrong');
    expect(wrongInsight.errorType).toBe('COMMON_MISTAKE');
    const correctInsight = body.responseInsights.find((r: any) => r.responseId === 'r-correct');
    expect(correctInsight.errorType).toBeNull();
  });

  it('recommends REVIEW_MISTAKES when the mistake queue has due entries', async () => {
    masteryEvent.findMany.mockResolvedValue([
      { questionId: 'q-9', isCorrect: false, createdAt: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000) },
    ]);
    const body = await (await call()).json();
    expect(body.recommendedAction).toEqual({ type: 'REVIEW_MISTAKES', count: 1 });
    expect(studentProgress.findFirst).not.toHaveBeenCalled();
  });

  it('recommends PRACTICE_WEAK_TOPIC from this attempt\'s topics when there are no due mistakes', async () => {
    studentProgress.findFirst.mockResolvedValue({ topic: 'Geometry' });
    const body = await (await call()).json();
    expect(body.recommendedAction).toEqual({ type: 'PRACTICE_WEAK_TOPIC', topic: 'Geometry' });
    expect(studentProgress.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ topic: { in: ['Algebra', 'Geometry'] } }),
    }));
  });

  it('recommends KEEP_GOING when there are no due mistakes and no tracked weak topic', async () => {
    const body = await (await call()).json();
    expect(body.recommendedAction).toEqual({ type: 'KEEP_GOING' });
  });
});
