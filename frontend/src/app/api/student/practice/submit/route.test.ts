import { beforeEach, describe, expect, it, vi } from 'vitest';

const getServerSession = vi.fn();
const awardPoints = vi.fn();
const revalidatePath = vi.fn();
const question = { findFirst: vi.fn() };
const tx = {
  testAttempt: { findFirst: vi.fn(), create: vi.fn() },
  studentProgress: { findUnique: vi.fn(), upsert: vi.fn() },
  masteryEvent: { create: vi.fn() },
};
const $transaction = vi.fn(async (callback: (client: typeof tx) => unknown) => callback(tx));

vi.mock('next-auth', () => ({ getServerSession }));
vi.mock('@/lib/auth', () => ({ authOptions: {} }));
vi.mock('@/lib/prisma', () => ({ default: { question, $transaction } }));
vi.mock('next/cache', () => ({ revalidatePath }));
vi.mock('@/lib/gamification', () => ({
  awardPoints,
  POINTS_RULES: { PRACTICE_QUESTION: 2 },
}));

describe('student practice submit', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getServerSession.mockResolvedValue({ user: { id: 'student-1', role: 'STUDENT' } });
    question.findFirst.mockResolvedValue({ id: 'question-1', correctAnswer: 'B', topic: 'Algebra', difficulty: 'MEDIUM' });
    tx.testAttempt.findFirst.mockResolvedValue(null);
    tx.testAttempt.create.mockResolvedValue({ id: 'attempt-1', responses: [] });
    tx.studentProgress.findUnique.mockResolvedValue({ masteryScore: 98, currentStreak: 4 });
    tx.studentProgress.upsert.mockResolvedValue({});
    tx.masteryEvent.create.mockResolvedValue({});
  });

  async function submit(body: Record<string, unknown>) {
    const { POST } = await import('./route');
    return POST(new Request('http://localhost/api/student/practice/submit', {
      method: 'POST',
      body: JSON.stringify(body),
    }));
  }

  it('computes correctness from the stored answer and clamps mastery', async () => {
    const response = await submit({ questionId: 'question-1', selectedOption: 'B', timeSpent: 12, isCorrect: false });
    const body = await response.json();

    expect(body.isCorrect).toBe(true);
    expect(question.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'question-1', status: { in: ['APPROVED', 'PENDING_REVIEW'] }, scope: 'PUBLIC' },
    }));
    expect(tx.testAttempt.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ totalCorrect: 1, totalIncorrect: 0 }),
    }));
    expect(tx.studentProgress.upsert).toHaveBeenCalledWith(expect.objectContaining({
      where: { userId_topic: { userId: 'student-1', topic: 'Algebra' } },
      update: expect.objectContaining({ masteryScore: 100, currentStreak: 5 }),
    }));
    expect(tx.masteryEvent.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ source: 'PRACTICE', previousScore: 98, newScore: 100, delta: 2 }),
    }));
  });

  it('accepts a freshly AI-generated (pending-review) question from the same student', async () => {
    // question.findFirst is mocked, not filtered, so this only proves the
    // route doesn't reject on status by itself; the where-clause assertion
    // above is what proves PENDING_REVIEW is actually included in the query.
    question.findFirst.mockResolvedValue({ id: 'question-2', correctAnswer: 'A', topic: 'Calculus' });
    const response = await submit({ questionId: 'question-2', selectedOption: 'A', timeSpent: 5 });
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.isCorrect).toBe(true);
  });

  it('rejects unavailable questions before writing', async () => {
    question.findFirst.mockResolvedValue(null);
    const response = await submit({ questionId: 'private-question', selectedOption: 'A' });
    expect(response.status).toBe(404);
    expect($transaction).not.toHaveBeenCalled();
  });

  it('does not repeat writes or points for a recent replay', async () => {
    tx.testAttempt.findFirst.mockResolvedValue({ id: 'attempt-existing', responses: [] });
    const response = await submit({ questionId: 'question-1', selectedOption: 'B', timeSpent: 12 });
    const body = await response.json();

    expect(body.duplicate).toBe(true);
    expect(body.pointsAwarded).toBe(0);
    expect(tx.testAttempt.create).not.toHaveBeenCalled();
    expect(tx.studentProgress.upsert).not.toHaveBeenCalled();
    expect(tx.masteryEvent.create).not.toHaveBeenCalled();
    expect(awardPoints).not.toHaveBeenCalled();
  });

  it('rejects a non-skip submission with no selectedOption', async () => {
    const response = await submit({ questionId: 'question-1', timeSpent: 5 });
    expect(response.status).toBe(400);
    expect($transaction).not.toHaveBeenCalled();
  });

  it('records a skip without an option, without touching mastery or points', async () => {
    const response = await submit({ questionId: 'question-1', skipped: true, timeSpent: 30 });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.isCorrect).toBe(false);
    expect(body.pointsAwarded).toBe(0);
    expect(tx.testAttempt.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        totalCorrect: 0,
        totalIncorrect: 0,
        totalSkipped: 1,
        responses: {
          create: expect.objectContaining({ selectedOption: null, status: 'SKIPPED', timeSpent: 30, isCorrect: false }),
        },
      }),
    }));
    expect(tx.studentProgress.upsert).not.toHaveBeenCalled();
    expect(tx.masteryEvent.create).not.toHaveBeenCalled();
    expect(awardPoints).not.toHaveBeenCalled();
  });

  it('scales the mastery delta by the question difficulty', async () => {
    question.findFirst.mockResolvedValue({ id: 'question-hard', correctAnswer: 'A', topic: 'Calculus', difficulty: 'HARD' });
    tx.studentProgress.findUnique.mockResolvedValue({ masteryScore: 50, currentStreak: 0 });
    const response = await submit({ questionId: 'question-hard', selectedOption: 'A', timeSpent: 20 });
    const body = await response.json();

    expect(body.isCorrect).toBe(true);
    expect(tx.masteryEvent.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ previousScore: 50, newScore: 58, delta: 8 }),
    }));
  });

  it('does not repeat a skip write on a recent replay', async () => {
    tx.testAttempt.findFirst.mockResolvedValue({ id: 'attempt-existing', responses: [] });
    const response = await submit({ questionId: 'question-1', skipped: true, timeSpent: 8 });
    const body = await response.json();

    expect(body.duplicate).toBe(true);
    expect(tx.testAttempt.create).not.toHaveBeenCalled();
  });
});
