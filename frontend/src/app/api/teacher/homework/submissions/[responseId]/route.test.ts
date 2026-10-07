import { beforeEach, describe, expect, it, vi } from 'vitest';

const getServerSession = vi.fn();
const recordAuditLog = vi.fn();
const testResponse = { findFirst: vi.fn() };
const testQuestion = { findFirst: vi.fn() };
const tx = {
  testResponse: { update: vi.fn(), aggregate: vi.fn() },
  testAttempt: { update: vi.fn() },
};
const $transaction = vi.fn(async (callback: (client: typeof tx) => unknown) => callback(tx));
const user = { findUnique: vi.fn() };

vi.mock('next-auth', () => ({ getServerSession }));
vi.mock('@/lib/auth', () => ({ authOptions: {} }));
vi.mock('@/lib/prisma', () => ({ default: { testResponse, testQuestion, $transaction, user } }));
vi.mock('@/lib/audit-log', () => ({ recordAuditLog, requestAuditContext: () => ({}) }));

describe('teacher homework review', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getServerSession.mockResolvedValue({ user: { id: 'teacher-1', role: 'TEACHER' } });
    user.findUnique.mockResolvedValue({ subscription: 'PREMIUM' });
    testResponse.findFirst.mockResolvedValue({ id: 'response-1', attemptId: 'attempt-1' });
    tx.testResponse.update.mockResolvedValue({ id: 'response-1', reviewStatus: 'REVIEWED' });
    tx.testResponse.aggregate.mockResolvedValue({ _sum: { marksAwarded: 7 } });
    tx.testAttempt.update.mockResolvedValue({});
    testQuestion.findFirst.mockResolvedValue(null);
  });

  async function review(body: Record<string, unknown>) {
    const { PATCH } = await import('./route');
    return PATCH(new Request('http://localhost/api/teacher/homework/submissions/response-1', {
      method: 'PATCH', body: JSON.stringify(body),
    }), { params: Promise.resolve({ responseId: 'response-1' }) });
  }

  it('reviews owned homework and recalculates the attempt score', async () => {
    const response = await review({ marksAwarded: 7, teacherFeedback: 'Clear reasoning.' });
    expect(response.status).toBe(200);
    expect(tx.testResponse.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ reviewStatus: 'REVIEWED', reviewedById: 'teacher-1', marksAwarded: 7 }),
    }));
    expect(tx.testAttempt.update).toHaveBeenCalledWith({ where: { id: 'attempt-1' }, data: { totalScore: 7 } });
    expect(recordAuditLog).toHaveBeenCalledWith(expect.objectContaining({ action: 'HOMEWORK_RESPONSE_REVIEWED' }));
  });

  it('rejects another teacher’s submission and invalid feedback', async () => {
    testResponse.findFirst.mockResolvedValue(null);
    expect((await review({ marksAwarded: 2, teacherFeedback: 'No' })).status).toBe(404);
    testResponse.findFirst.mockResolvedValue({ id: 'response-1', attemptId: 'attempt-1' });
    expect((await review({ marksAwarded: -1, teacherFeedback: '' })).status).toBe(400);
    expect($transaction).not.toHaveBeenCalled();
  });

  it('limits the mark to what the question is worth in its section, and says so', async () => {
    testResponse.findFirst.mockResolvedValue({ id: 'response-1', attemptId: 'attempt-1', questionId: 'q-1', attempt: { testId: 'test-1' } });
    testQuestion.findFirst.mockResolvedValue({ section: { marksPerQuestion: 5 } });
    const over = await review({ marksAwarded: 6, teacherFeedback: 'Too generous.' });
    expect(over.status).toBe(400);
    expect((await over.json()).error).toMatch(/between 0 and 5/);
    expect($transaction).not.toHaveBeenCalled();
    expect((await review({ marksAwarded: 4.5, teacherFeedback: 'Good, one slip.' })).status).toBe(200);
  });

  it('looks for the submission among homework and mock exams the teacher owns or teaches', async () => {
    await review({ marksAwarded: 1, teacherFeedback: 'ok' });
    const where = testResponse.findFirst.mock.calls[0][0].where;
    expect(JSON.stringify(where.attempt.test)).toContain('MOCK_EXAM');
    expect(JSON.stringify(where.attempt.test)).toContain('HOMEWORK');
    expect(JSON.stringify(where.attempt.test)).toContain('teacher-1');
  });
});
