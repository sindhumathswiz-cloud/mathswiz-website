import { beforeEach, describe, expect, it, vi } from 'vitest';

const getServerSession = vi.fn();
const batchEnrollment = { findMany: vi.fn() };
const testAttempt = { findMany: vi.fn() };
const testResponse = { groupBy: vi.fn() };
const question = { findMany: vi.fn() };

vi.mock('next-auth', () => ({ getServerSession }));
vi.mock('@/lib/auth', () => ({ authOptions: {} }));
vi.mock('@/lib/prisma', () => ({ default: { batchEnrollment, testAttempt, testResponse, question } }));

function get(url: string) {
  return import('./route').then(({ GET }) => GET(new Request(url)));
}

describe('GET /api/teacher/heatmap/wrong-answers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getServerSession.mockResolvedValue({ user: { id: 'teacher-1', role: 'TEACHER' } });
    batchEnrollment.findMany.mockResolvedValue([{ studentId: 's-1' }]);
    testAttempt.findMany.mockResolvedValue([{ id: 'attempt-1' }]);
  });

  it('rejects non-teacher roles', async () => {
    getServerSession.mockResolvedValue(null);
    const response = await get('http://localhost/api/teacher/heatmap/wrong-answers?batchId=batch-1');
    expect(response.status).toBe(401);
  });

  it('rejects a missing batchId', async () => {
    const response = await get('http://localhost/api/teacher/heatmap/wrong-answers');
    expect(response.status).toBe(400);
  });

  it('excludes correct answers and null selections from the groupBy where clause', async () => {
    testResponse.groupBy.mockResolvedValue([]);
    await get('http://localhost/api/teacher/heatmap/wrong-answers?batchId=batch-1');
    expect(testResponse.groupBy).toHaveBeenCalledWith(expect.objectContaining({
      by: ['questionId', 'selectedOption'],
      where: expect.objectContaining({ isCorrect: false, selectedOption: { not: null } }),
    }));
  });

  it('aggregates the wrong-option breakdown per question, sorted by total wrong', async () => {
    testResponse.groupBy.mockResolvedValue([
      { questionId: 'q-1', selectedOption: 'A', _count: { _all: 5 } },
      { questionId: 'q-1', selectedOption: 'B', _count: { _all: 2 } },
      { questionId: 'q-2', selectedOption: 'C', _count: { _all: 1 } },
    ]);
    question.findMany.mockResolvedValue([
      { id: 'q-1', content: 'Q1', topic: 'Algebra', correctAnswer: 'C' },
      { id: 'q-2', content: 'Q2', topic: 'Algebra', correctAnswer: 'D' },
    ]);
    const response = await get('http://localhost/api/teacher/heatmap/wrong-answers?batchId=batch-1');
    const body = await response.json();
    expect(body.questions[0].questionId).toBe('q-1');
    expect(body.questions[0].totalWrong).toBe(7);
    expect(body.questions[0].wrongOptionBreakdown[0]).toEqual({ option: 'A', count: 5 });
    expect(body.questions[1].questionId).toBe('q-2');
  });

  it('returns empty when the batch has no attempts', async () => {
    testAttempt.findMany.mockResolvedValue([]);
    const response = await get('http://localhost/api/teacher/heatmap/wrong-answers?batchId=batch-1');
    const body = await response.json();
    expect(body.questions).toEqual([]);
    expect(testResponse.groupBy).not.toHaveBeenCalled();
  });
});
