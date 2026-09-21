import { beforeEach, describe, expect, it, vi } from 'vitest';

const getServerSession = vi.fn();
const revalidatePath = vi.fn();
const awardPoints = vi.fn();
const recordAuditLog = vi.fn();
const requestAuditContext = vi.fn(() => ({}));
const applyMasteryUpdate = vi.fn();

const tx = {
  testAttempt: { updateMany: vi.fn(), findUniqueOrThrow: vi.fn() },
  testResponse: { createMany: vi.fn() },
};
const $transaction = vi.fn(async (callback: (client: typeof tx) => unknown) => callback(tx));

const testAttempt = { findFirst: vi.fn() };
const test = { findUnique: vi.fn() };
const testAssignment = { findFirst: vi.fn() };

vi.mock('next-auth', () => ({ getServerSession }));
vi.mock('@/lib/auth', () => ({ authOptions: {} }));
vi.mock('@/lib/prisma', () => ({ default: { testAttempt, test, testAssignment, $transaction } }));
vi.mock('next/cache', () => ({ revalidatePath }));
vi.mock('@/lib/gamification', () => ({ awardPoints, POINTS_RULES: { TEST_COMPLETED: 10, TEST_PERFECT_SCORE: 20 } }));
vi.mock('@/lib/audit-log', () => ({ recordAuditLog, requestAuditContext }));
vi.mock('@/lib/mastery', () => ({ applyMasteryUpdate }));

const SECTION = { marksPerQuestion: 4, negativeMarks: 1 };
const QUESTION = { id: 'q1', type: 'SINGLE_CHOICE', correctAnswer: 'B', topic: 'Algebra', difficulty: 'MEDIUM' };

function setUpTest() {
  testAttempt.findFirst.mockResolvedValue({ id: 'attempt-1', userId: 'student-1', testId: 'test-1', status: 'IN_PROGRESS' });
  test.findUnique.mockResolvedValue({
    id: 'test-1',
    sections: [{ ...SECTION, questions: [{ question: QUESTION }] }],
  });
  testAssignment.findFirst.mockResolvedValue(null);
  tx.testAttempt.updateMany.mockResolvedValue({ count: 1 });
  tx.testAttempt.findUniqueOrThrow.mockResolvedValue({ id: 'attempt-1', status: 'SUBMITTED' });
  tx.testResponse.createMany.mockResolvedValue({ count: 1 });
}

function submit(responses: Record<string, unknown>) {
  return async () => {
    const { POST } = await import('./route');
    return POST(
      new Request('http://localhost/api/student/tests/test-1/submit', {
        method: 'POST',
        body: JSON.stringify({ attemptId: 'attempt-1', responses }),
      }),
      { params: Promise.resolve({ id: 'test-1' }) }
    );
  };
}

describe('POST /api/student/tests/[id]/submit -- mark-for-review propagation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getServerSession.mockResolvedValue({ user: { id: 'student-1', role: 'STUDENT' } });
    setUpTest();
  });

  it('rejects non-student roles', async () => {
    getServerSession.mockResolvedValue({ user: { id: 'teacher-1', role: 'TEACHER' } });
    const response = await submit({})();
    expect(response.status).toBe(403);
  });

  it('rejects an attempt that does not belong to this test/student', async () => {
    testAttempt.findFirst.mockResolvedValue(null);
    const response = await submit({})();
    expect(response.status).toBe(404);
  });

  it('rejects a re-submission of an already-submitted attempt', async () => {
    testAttempt.findFirst.mockResolvedValue({ id: 'attempt-1', userId: 'student-1', testId: 'test-1', status: 'SUBMITTED' });
    const response = await submit({})();
    expect(response.status).toBe(400);
  });

  it('stores MARKED_FOR_REVIEW for an answered-and-marked response, with scoring identical to a plain answer', async () => {
    await submit({ q1: { selectedOption: 'B', status: 'ANSWERED_AND_MARKED', timeSpent: 10 } })();

    expect(tx.testResponse.createMany).toHaveBeenCalledWith(expect.objectContaining({
      data: [expect.objectContaining({ status: 'MARKED_FOR_REVIEW', isCorrect: true, marksAwarded: 4, selectedOption: 'B' })],
    }));
    expect(tx.testAttempt.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ totalScore: 4, totalCorrect: 1, totalIncorrect: 0, totalSkipped: 0 }),
    }));
  });

  it('stores MARKED_FOR_REVIEW for a pure mark (unanswered), with scoring identical to a plain skip', async () => {
    await submit({ q1: { selectedOption: null, status: 'MARKED_FOR_REVIEW', timeSpent: 3 } })();

    expect(tx.testResponse.createMany).toHaveBeenCalledWith(expect.objectContaining({
      data: [expect.objectContaining({ status: 'MARKED_FOR_REVIEW', isCorrect: false, marksAwarded: 0, selectedOption: null })],
    }));
    expect(tx.testAttempt.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ totalScore: 0, totalCorrect: 0, totalIncorrect: 0, totalSkipped: 1 }),
    }));
  });

  it('leaves an ordinary (unmarked) answered response stored as ANSWERED', async () => {
    await submit({ q1: { selectedOption: 'B', status: 'ANSWERED', timeSpent: 10 } })();

    expect(tx.testResponse.createMany).toHaveBeenCalledWith(expect.objectContaining({
      data: [expect.objectContaining({ status: 'ANSWERED', isCorrect: true, marksAwarded: 4 })],
    }));
    expect(tx.testAttempt.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ totalScore: 4, totalCorrect: 1, totalIncorrect: 0, totalSkipped: 0 }),
    }));
  });
});
