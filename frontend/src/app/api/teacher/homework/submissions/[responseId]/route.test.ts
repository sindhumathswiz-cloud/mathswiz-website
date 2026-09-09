import { beforeEach, describe, expect, it, vi } from 'vitest';

const getServerSession = vi.fn();
const recordAuditLog = vi.fn();
const testResponse = { findFirst: vi.fn() };
const tx = {
  testResponse: { update: vi.fn(), aggregate: vi.fn() },
  testAttempt: { update: vi.fn() },
};
const $transaction = vi.fn(async (callback: (client: typeof tx) => unknown) => callback(tx));

vi.mock('next-auth', () => ({ getServerSession }));
vi.mock('@/lib/auth', () => ({ authOptions: {} }));
vi.mock('@/lib/prisma', () => ({ default: { testResponse, $transaction } }));
vi.mock('@/lib/audit-log', () => ({ recordAuditLog, requestAuditContext: () => ({}) }));

describe('teacher homework review', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getServerSession.mockResolvedValue({ user: { id: 'teacher-1', role: 'TEACHER' } });
    testResponse.findFirst.mockResolvedValue({ id: 'response-1', attemptId: 'attempt-1' });
    tx.testResponse.update.mockResolvedValue({ id: 'response-1', reviewStatus: 'REVIEWED' });
    tx.testResponse.aggregate.mockResolvedValue({ _sum: { marksAwarded: 7 } });
    tx.testAttempt.update.mockResolvedValue({});
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
});
