// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

const getServerSession = vi.fn();
const requirePremiumTeacher = vi.fn();
const question = { findFirst: vi.fn() };
const test = { create: vi.fn(), findFirst: vi.fn(), update: vi.fn() };
const testQuestion = { create: vi.fn() };
const $transaction = vi.fn(async (ops: unknown[]) => ops);

vi.mock('next-auth', () => ({ getServerSession }));
vi.mock('@/lib/auth', () => ({ authOptions: {} }));
vi.mock('@/lib/teacher-api-guard', () => ({ requirePremiumTeacher }));
vi.mock('@/lib/prisma', () => ({ default: { question, test, testQuestion, $transaction } }));

const post = async (body: unknown) => {
  const { POST } = await import('./route');
  return (await POST(new Request('http://localhost/api/teacher/tests/collect', { method: 'POST', body: JSON.stringify(body) }))) as Response;
};
const draft = (over: Record<string, unknown> = {}) => ({
  id: 't1', title: 'Integrals revision', isPublished: false, totalMarks: 2, _count: { attempts: 0 },
  sections: [{ id: 's1', marksPerQuestion: 1, questions: [{ questionId: 'qa', orderIndex: 0 }, { questionId: 'qb', orderIndex: 1 }] }],
  ...over,
});

describe('POST /api/teacher/tests/collect', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requirePremiumTeacher.mockResolvedValue({ ok: true, userId: 't-teacher', role: 'TEACHER' });
    question.findFirst.mockResolvedValue({ id: 'q9', book: { className: 'Class 12' } });
    test.findFirst.mockResolvedValue(draft());
    test.create.mockImplementation(async ({ data }) => ({ id: 'new-test', title: data.title }));
  });

  it('adds the question to the end of an unpublished test of the teacher', async () => {
    const res = await post({ questionId: 'q9', testId: 't1' });
    expect(res.status).toBe(200);
    expect(testQuestion.create).toHaveBeenCalledWith({ data: { sectionId: 's1', questionId: 'q9', orderIndex: 2 } });
    expect(test.update).toHaveBeenCalledWith({ where: { id: 't1' }, data: { totalMarks: { increment: 1 } } });
    expect((await res.json()).questionCount).toBe(3);
    expect(test.findFirst.mock.calls[0][0].where).toEqual({ id: 't1', createdById: 't-teacher' });
  });

  it('starts a new test with the question', async () => {
    const res = await post({ questionId: 'q9', newTitle: '  My worksheet ' });
    expect(res.status).toBe(201);
    const data = test.create.mock.calls[0][0].data;
    expect(data).toMatchObject({ title: 'My worksheet', isPublished: false, class: 'Class 12', createdById: 't-teacher', totalMarks: 1 });
    expect(data.sections.create[0].questions.create).toEqual([{ questionId: 'q9', orderIndex: 0 }]);
  });

  it('refuses a published or attempted test, and a question already in it', async () => {
    test.findFirst.mockResolvedValue(draft({ isPublished: true }));
    expect((await post({ questionId: 'q9', testId: 't1' })).status).toBe(409);
    test.findFirst.mockResolvedValue(draft({ _count: { attempts: 3 } }));
    expect((await post({ questionId: 'q9', testId: 't1' })).status).toBe(409);
    test.findFirst.mockResolvedValue(draft());
    expect((await post({ questionId: 'qa', testId: 't1' })).status).toBe(409);
    expect(testQuestion.create).not.toHaveBeenCalled();
  });

  it('refuses another teacher\'s test, an unknown question, and a request without a target', async () => {
    test.findFirst.mockResolvedValue(null);
    expect((await post({ questionId: 'q9', testId: 'someone-else' })).status).toBe(404);
    question.findFirst.mockResolvedValue(null);
    expect((await post({ questionId: 'nope', testId: 't1' })).status).toBe(404);
    expect((await post({ questionId: 'q9' })).status).toBe(400);
  });
});
