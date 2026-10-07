import { beforeEach, describe, expect, it, vi } from 'vitest';

const getServerSession = vi.fn();
const revalidatePath = vi.fn();
const awardPoints = vi.fn();
const recordAuditLog = vi.fn();
const requestAuditContext = vi.fn(() => ({}));
const applyMasteryUpdate = vi.fn();
const recordQuestionReview = vi.fn();

const tx = {
  testAttempt: { updateMany: vi.fn(), findUniqueOrThrow: vi.fn() },
  testResponse: { createMany: vi.fn() },
};
const $transaction = vi.fn(async (callback: (client: typeof tx) => unknown) => callback(tx));

const testAttempt = { findFirst: vi.fn() };
const test = { findUnique: vi.fn() };
const testAssignment = { findFirst: vi.fn() };
const answerImage = { findMany: vi.fn().mockResolvedValue([]), deleteMany: vi.fn().mockResolvedValue({ count: 0 }) };

vi.mock('next-auth', () => ({ getServerSession }));
vi.mock('@/lib/auth', () => ({ authOptions: {} }));
vi.mock('@/lib/prisma', () => ({ default: { testAttempt, test, testAssignment, answerImage, $transaction } }));
vi.mock('next/cache', () => ({ revalidatePath }));
vi.mock('@/lib/gamification', () => ({ awardPoints, POINTS_RULES: { TEST_COMPLETED: 10, TEST_PERFECT_SCORE: 20 } }));
vi.mock('@/lib/audit-log', () => ({ recordAuditLog, requestAuditContext }));
vi.mock('@/lib/mastery', () => ({ applyMasteryUpdate }));
vi.mock('@/lib/spaced-repetition-review', () => ({ recordQuestionReview }));

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
  recordQuestionReview.mockResolvedValue(null);
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

  it('records an SM-2 review with wasMarkedForReview true for an answered-and-marked response', async () => {
    await submit({ q1: { selectedOption: 'A', status: 'ANSWERED_AND_MARKED', timeSpent: 10 } })();

    expect(recordQuestionReview).toHaveBeenCalledWith(tx, expect.objectContaining({
      userId: 'student-1',
      questionId: 'q1',
      signal: expect.objectContaining({ isCorrect: false, timeSpent: 10, wasMarkedForReview: true }),
    }));
  });

  it('records an SM-2 review with wasMarkedForReview false for a plain answer', async () => {
    await submit({ q1: { selectedOption: 'B', status: 'ANSWERED', timeSpent: 10 } })();

    expect(recordQuestionReview).toHaveBeenCalledWith(tx, expect.objectContaining({
      signal: expect.objectContaining({ isCorrect: true, wasMarkedForReview: false }),
    }));
  });

  it('never records an SM-2 review for a question with no objective answer submitted (pure mark, unanswered)', async () => {
    await submit({ q1: { selectedOption: null, status: 'MARKED_FOR_REVIEW', timeSpent: 3 } })();
    expect(recordQuestionReview).not.toHaveBeenCalled();
  });
});

describe('POST /api/student/tests/[id]/submit -- mock exam scoring', () => {
  const numerical = (n: number) => Array.from({ length: n }, (_, i) => ({ question: { id: `n${i + 1}`, type: 'INTEGER', correctAnswer: '5', topic: 'Algebra', difficulty: 'MEDIUM' } }));
  const mcq = (n: number) => Array.from({ length: n }, (_, i) => ({ question: { id: `m${i + 1}`, type: 'SINGLE_CHOICE', correctAnswer: 'B', topic: 'Algebra', difficulty: 'MEDIUM' } }));

  const useSections = (sections: unknown[]) => test.findUnique.mockResolvedValue({ id: 'test-1', sections });
  const records = () => tx.testResponse.createMany.mock.calls[0][0].data as Array<{ questionId: string; status: string; marksAwarded: number; isCorrect: boolean; selectedOption: string | null }>;
  const attemptTotals = () => tx.testAttempt.updateMany.mock.calls[0][0].data as { totalScore: number; totalCorrect: number; totalIncorrect: number; totalSkipped: number };

  beforeEach(() => {
    vi.clearAllMocks();
    getServerSession.mockResolvedValue({ user: { id: 'student-1', role: 'STUDENT' } });
    setUpTest();
  });

  it('scores a JEE-style paper: -1 for a wrong choice, and no penalty on the numerical section', async () => {
    useSections([
      { marksPerQuestion: 4, negativeMarks: 1, attemptLimit: null, questions: mcq(2) },
      { marksPerQuestion: 4, negativeMarks: 0, attemptLimit: 5, questions: numerical(2) },
    ]);
    await submit({
      m1: { selectedOption: 'B', status: 'ANSWERED' },   // right  +4
      m2: { selectedOption: 'A', status: 'ANSWERED' },   // wrong  -1
      n1: { selectedOption: '5', status: 'ANSWERED' },   // right  +4
      n2: { selectedOption: '9', status: 'ANSWERED' },   // wrong   0
    })();
    expect(attemptTotals()).toMatchObject({ totalScore: 7, totalCorrect: 2, totalIncorrect: 2, totalSkipped: 0 });
  });

  it('scores only the first N answered questions of a limited section and records the rest as OVER_LIMIT', async () => {
    useSections([{ marksPerQuestion: 4, negativeMarks: 0, attemptLimit: 2, questions: numerical(4) }]);
    await submit({
      n1: { selectedOption: '5' }, n2: { selectedOption: '5' }, n3: { selectedOption: '5' }, n4: { selectedOption: '9' },
    })();
    const byId = Object.fromEntries(records().map(r => [r.questionId, r]));
    expect(byId.n1).toMatchObject({ status: 'ANSWERED', marksAwarded: 4, isCorrect: true });
    expect(byId.n2).toMatchObject({ status: 'ANSWERED', marksAwarded: 4, isCorrect: true });
    // Beyond the limit: recorded, never scored, never right, wrong or skipped.
    expect(byId.n3).toMatchObject({ status: 'OVER_LIMIT', marksAwarded: 0, isCorrect: false, selectedOption: '5' });
    expect(byId.n4).toMatchObject({ status: 'OVER_LIMIT', marksAwarded: 0, isCorrect: false });
    expect(attemptTotals()).toMatchObject({ totalScore: 8, totalCorrect: 2, totalIncorrect: 0, totalSkipped: 0 });
  });

  it('keeps an over-limit answer OVER_LIMIT even if it was marked for review, and feeds it to no mastery update', async () => {
    useSections([{ marksPerQuestion: 4, negativeMarks: 1, attemptLimit: 1, questions: mcq(2) }]);
    await submit({ m1: { selectedOption: 'B' }, m2: { selectedOption: 'A', status: 'ANSWERED_AND_MARKED' } })();
    expect(records().find(r => r.questionId === 'm2')?.status).toBe('OVER_LIMIT');
    expect(applyMasteryUpdate).toHaveBeenCalledTimes(1);
  });

  it('a limit above the number of questions changes nothing, and unanswered questions in a limited section are still skipped', async () => {
    useSections([{ marksPerQuestion: 4, negativeMarks: 0, attemptLimit: 10, questions: numerical(3) }]);
    await submit({ n1: { selectedOption: '5' } })();
    expect(attemptTotals()).toMatchObject({ totalScore: 4, totalCorrect: 1, totalSkipped: 2 });
  });

  it('accepts a numerical answer in any equivalent form', async () => {
    useSections([{ marksPerQuestion: 4, negativeMarks: 0, attemptLimit: null, questions: numerical(3) }]);
    await submit({ n1: { selectedOption: '5.0' }, n2: { selectedOption: ' 05 ' }, n3: { selectedOption: '5.001' } })();
    expect(attemptTotals()).toMatchObject({ totalCorrect: 2, totalIncorrect: 1 });
  });

  it('treats a cleared numerical box as unanswered, not as a wrong answer', async () => {
    useSections([{ marksPerQuestion: 4, negativeMarks: 1, attemptLimit: null, questions: numerical(2) }]);
    await submit({ n1: { selectedOption: '' }, n2: { selectedOption: '   ' } })();
    expect(attemptTotals()).toMatchObject({ totalScore: 0, totalIncorrect: 0, totalSkipped: 2 });
  });

  it('handles fractional marking such as the NDA 2.5 / -0.83 scheme and stores 1.67, not 1.6700000000000002', async () => {
    useSections([{ marksPerQuestion: 2.5, negativeMarks: 0.83, attemptLimit: null, questions: mcq(2) }]);
    await submit({ m1: { selectedOption: 'B' }, m2: { selectedOption: 'A' } })();
    expect(attemptTotals().totalScore).toBe(1.67);
  });
});

describe('POST /api/student/tests/[id]/submit -- server-side exam clock', () => {
  const ago = (seconds: number) => new Date(Date.now() - seconds * 1000);
  const mcq = [{ question: { id: 'm1', type: 'SINGLE_CHOICE', correctAnswer: 'B', topic: 'Algebra', difficulty: 'MEDIUM' } }];
  const totals = () => tx.testAttempt.updateMany.mock.calls[0][0].data as { totalScore: number; totalCorrect: number; totalIncorrect: number };

  const withAttempt = (attempt: Record<string, unknown>) => {
    testAttempt.findFirst.mockResolvedValue({ id: 'attempt-1', userId: 'student-1', testId: 'test-1', status: 'IN_PROGRESS', ...attempt });
    test.findUnique.mockResolvedValue({ id: 'test-1', duration: 60, sections: [{ ...SECTION, attemptLimit: null, questions: mcq }] });
  };

  beforeEach(() => {
    vi.clearAllMocks();
    getServerSession.mockResolvedValue({ user: { id: 'student-1', role: 'STUDENT' } });
    setUpTest();
  });

  it('trusts the answers in the request while the clock is running', async () => {
    withAttempt({ startTime: ago(1800), examStartedAt: ago(1800), savedResponses: { m1: { selectedOption: 'A' } } });
    const body = await (await submit({ m1: { selectedOption: 'B' } })()).json();
    expect(totals()).toMatchObject({ totalCorrect: 1, totalScore: 4 });
    expect(body.scoredFromSavedCopy).toBe(false);
  });

  it('still accepts the browser submit that arrives a few seconds after the deadline', async () => {
    withAttempt({ startTime: ago(3600 + 30), examStartedAt: ago(3600 + 30) });
    await submit({ m1: { selectedOption: 'B' } })();
    expect(totals().totalCorrect).toBe(1);
  });

  it('scores a late submit from the answers saved in time, ignoring what the request now claims', async () => {
    withAttempt({ startTime: ago(7200), examStartedAt: ago(7200), savedResponses: { m1: { selectedOption: 'A' } } });
    const body = await (await submit({ m1: { selectedOption: 'B' } })()).json();
    expect(totals()).toMatchObject({ totalCorrect: 0, totalIncorrect: 1, totalScore: -1 });
    expect(body.scoredFromSavedCopy).toBe(true);
    expect(recordAuditLog).toHaveBeenCalledWith(expect.objectContaining({ metadata: expect.objectContaining({ scoredFromSavedCopy: true }) }));
  });

  it('a late submit with nothing saved scores a blank paper rather than the late answers', async () => {
    withAttempt({ startTime: ago(7200), examStartedAt: ago(7200), savedResponses: null });
    await submit({ m1: { selectedOption: 'B' } })();
    expect(totals()).toMatchObject({ totalCorrect: 0, totalIncorrect: 0, totalScore: 0 });
  });

  it('counts the clock from the Start press, not from when the page was first opened', async () => {
    // Opened 2 hours ago, but the exam was only started 10 minutes ago.
    withAttempt({ startTime: ago(7200), examStartedAt: ago(600) });
    await submit({ m1: { selectedOption: 'B' } })();
    expect(totals().totalCorrect).toBe(1);
  });
});

describe('POST /api/student/tests/[id]/submit -- written answers in a mock exam', () => {
  const written = { id: 'w1', type: 'LONG_ANSWER', correctAnswer: null, topic: 'Calculus', difficulty: 'HARD' };
  const ar = { id: 'ar1', type: 'ASSERTION_REASONING', correctAnswer: 'C', topic: 'Algebra', difficulty: 'EASY' };
  const choice = { id: 'm1', type: 'SINGLE_CHOICE', correctAnswer: 'B', topic: 'Algebra', difficulty: 'EASY' };
  const records = () => tx.testResponse.createMany.mock.calls[0][0].data as Array<{ questionId: string; status: string; reviewStatus: string; marksAwarded: number; subjectiveText: string | null; isCorrect: boolean }>;
  const totals = () => tx.testAttempt.updateMany.mock.calls[0][0].data as { totalScore: number; totalCorrect: number; totalIncorrect: number; totalSkipped: number };

  const paper = (templateType: string | null) => test.findUnique.mockResolvedValue({
    id: 'test-1', templateType, duration: 180,
    sections: [
      { marksPerQuestion: 1, negativeMarks: 0, attemptLimit: null, questions: [{ question: choice }, { question: ar }] },
      { marksPerQuestion: 5, negativeMarks: 0, attemptLimit: null, questions: [{ question: written }] },
    ],
  });

  beforeEach(() => {
    vi.clearAllMocks();
    getServerSession.mockResolvedValue({ user: { id: 'student-1', role: 'STUDENT' } });
    setUpTest();
  });

  it('queues a written answer for the teacher in a mock exam, scoring nothing for it yet', async () => {
    paper('MOCK_EXAM');
    const body = await (await submit({ m1: { selectedOption: 'B' }, ar1: { selectedOption: 'C' }, w1: { subjectiveText: '  Integrating by parts gives ...  ' } })()).json();
    const w = records().find(r => r.questionId === 'w1')!;
    expect(w).toMatchObject({ status: 'ANSWERED', reviewStatus: 'PENDING', marksAwarded: 0, subjectiveText: 'Integrating by parts gives ...' });
    // The choice questions are scored now; the written one is neither right, wrong nor skipped.
    expect(totals()).toMatchObject({ totalScore: 2, totalCorrect: 2, totalIncorrect: 0, totalSkipped: 0 });
    expect(body.pendingReview).toBe(1);
  });

  it('does not queue it for review in an ordinary test, where nobody would ever mark it', async () => {
    paper(null);
    await submit({ w1: { subjectiveText: 'An answer' } })();
    expect(records().find(r => r.questionId === 'w1')?.reviewStatus).toBe('NOT_REQUIRED');
  });

  it('counts an empty written answer as skipped', async () => {
    paper('MOCK_EXAM');
    await submit({ w1: { subjectiveText: '   ' } })();
    expect(records().find(r => r.questionId === 'w1')?.status).toBe('SKIPPED');
    expect(totals().totalSkipped).toBe(3);
  });

  it('scores assertion-and-reason questions like any other choice question', async () => {
    paper('MOCK_EXAM');
    await submit({ ar1: { selectedOption: 'A' } })();
    expect(records().find(r => r.questionId === 'ar1')).toMatchObject({ isCorrect: false, marksAwarded: 0 });
    expect(totals().totalIncorrect).toBe(1);
  });

  it('ignores written text sent for a choice question instead of scoring the string "null" as an answer', async () => {
    paper('MOCK_EXAM');
    await submit({ m1: { subjectiveText: 'sneaky' } })();
    expect(records().find(r => r.questionId === 'm1')?.status).toBe('SKIPPED');
  });
});

describe('POST /api/student/tests/[id]/submit -- internal choice and photo answers', () => {
  const choice = (id: string) => ({ id, type: 'SINGLE_CHOICE', correctAnswer: 'B', topic: 'Algebra', difficulty: 'EASY' });
  const written = (id: string) => ({ id, type: 'LONG_ANSWER', correctAnswer: null, topic: 'Calculus', difficulty: 'HARD' });
  const records = () => tx.testResponse.createMany.mock.calls[0][0].data as Array<{ questionId: string; status: string; reviewStatus: string; marksAwarded: number; subjectiveImage: string | null; isCorrect: boolean }>;
  const totals = () => tx.testAttempt.updateMany.mock.calls[0][0].data as { totalScore: number; totalCorrect: number; totalIncorrect: number; totalSkipped: number };
  const paper = (questions: Array<{ question: object; choiceGroup?: string }>) => test.findUnique.mockResolvedValue({
    id: 'test-1', templateType: 'MOCK_EXAM', duration: 180,
    sections: [{ marksPerQuestion: 3, negativeMarks: 0, attemptLimit: null, questions }],
  });

  beforeEach(() => {
    vi.clearAllMocks();
    getServerSession.mockResolvedValue({ user: { id: 'student-1', role: 'STUDENT' } });
    setUpTest();
    answerImage.findMany.mockResolvedValue([]);
  });

  it('scores only one of two alternatives, even if the student answered both', async () => {
    paper([{ question: choice('a'), choiceGroup: 'g' }, { question: choice('b'), choiceGroup: 'g' }]);
    await submit({ a: { selectedOption: 'B' }, b: { selectedOption: 'B' } })();
    expect(totals()).toMatchObject({ totalCorrect: 1, totalScore: 3 });
    expect(records().map(r => [r.questionId, r.status])).toEqual([['a', 'ANSWERED'], ['b', 'OVER_LIMIT']]);
  });

  it('scores the alternative that was answered when only the second one was', async () => {
    paper([{ question: choice('a'), choiceGroup: 'g' }, { question: choice('b'), choiceGroup: 'g' }]);
    await submit({ b: { selectedOption: 'A' } })();
    expect(records().find(r => r.questionId === 'b')).toMatchObject({ status: 'ANSWERED', isCorrect: false });
    // The unanswered alternative is not a skipped question: it was never required.
    expect(totals()).toMatchObject({ totalIncorrect: 1, totalSkipped: 0 });
  });

  it('counts a pair of alternatives that were both left blank as one skipped question, not two', async () => {
    paper([{ question: choice('a'), choiceGroup: 'g' }, { question: choice('b'), choiceGroup: 'g' }, { question: choice('c') }]);
    await submit({})();
    expect(totals()).toMatchObject({ totalSkipped: 2 });
  });

  it('queues only the counted written alternative for the teacher', async () => {
    paper([{ question: written('w1'), choiceGroup: 'g' }, { question: written('w2'), choiceGroup: 'g' }]);
    const body = await (await submit({ w1: { subjectiveText: 'First' }, w2: { subjectiveText: 'Second' } })()).json();
    expect(records().map(r => [r.questionId, r.status, r.reviewStatus])).toEqual([['w1', 'ANSWERED', 'PENDING'], ['w2', 'OVER_LIMIT', 'NOT_REQUIRED']]);
    expect(body.pendingReview).toBe(1);
  });

  it('attaches only photos this student uploaded for that question, and stores our own paths', async () => {
    paper([{ question: written('w1') }, { question: written('w2') }]);
    answerImage.findMany.mockResolvedValue([{ id: 'img-mine', questionId: 'w1' }, { id: 'img-other-question', questionId: 'w2' }]);
    await submit({ w1: { subjectiveImages: ['img-mine', 'img-other-question', 'made-up', 42] }, w2: { subjectiveImages: ['img-other-question'] } })();
    const [w1, w2] = records();
    expect(JSON.parse(w1.subjectiveImage!)).toEqual(['/api/answer-images/img-mine']);
    expect(w1).toMatchObject({ status: 'ANSWERED', reviewStatus: 'PENDING' });
    expect(JSON.parse(w2.subjectiveImage!)).toEqual(['/api/answer-images/img-other-question']);
  });

  it('never stores a raw url sent by the client, and a photo with no text is still an answer', async () => {
    paper([{ question: written('w1') }]);
    await submit({ w1: { subjectiveImage: 'https://evil.example/x.png', subjectiveText: '' } })();
    expect(records()[0]).toMatchObject({ status: 'SKIPPED', subjectiveImage: null });
    vi.clearAllMocks();
    setUpTest();
    paper([{ question: written('w1') }]);
    answerImage.findMany.mockResolvedValue([{ id: 'img1', questionId: 'w1' }]);
    await submit({ w1: { subjectiveImages: ['img1'] } })();
    expect(records()[0]).toMatchObject({ status: 'ANSWERED', reviewStatus: 'PENDING' });
  });

  it('deletes uploaded photos that did not make it into an answer', async () => {
    paper([{ question: written('w1') }]);
    answerImage.findMany.mockResolvedValue([{ id: 'kept', questionId: 'w1' }, { id: 'stray', questionId: 'w1' }]);
    await submit({ w1: { subjectiveImages: ['kept'] } })();
    expect(answerImage.deleteMany).toHaveBeenCalledWith({ where: { attemptId: 'attempt-1', id: { notIn: ['kept'] } } });
  });
});
