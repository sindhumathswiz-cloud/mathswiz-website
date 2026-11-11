// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

const getServerSession = vi.fn();
const requirePremiumTeacher = vi.fn();
const question = { findMany: vi.fn() };
const test = { create: vi.fn(), findFirst: vi.fn(), update: vi.fn() };
const testQuestion = { createMany: vi.fn() };
const $transaction = vi.fn(async (ops: unknown[]) => ops);

vi.mock('next-auth', () => ({ getServerSession }));
vi.mock('@/lib/auth', () => ({ authOptions: {} }));
vi.mock('@/lib/teacher-api-guard', () => ({ requirePremiumTeacher }));
vi.mock('@/lib/prisma', () => ({ default: { question, test, testQuestion, $transaction } }));

const post = async (body: unknown) => {
  const { POST } = await import('./route');
  return (await POST(new Request('http://localhost/api/teacher/tests/collect-many', { method: 'POST', body: JSON.stringify(body) }))) as Response;
};
const usable = (...ids: string[]) => ids.map((id) => ({ id, class: null, book: { className: id === 'q3' ? 'Class 11' : 'Class 12' } }));
const draft = (over: Record<string, unknown> = {}) => ({
  id: 't1', title: 'Integrals revision', isPublished: false, _count: { attempts: 0 },
  sections: [{ id: 's1', marksPerQuestion: 2, questions: [{ questionId: 'q1', orderIndex: 0 }, { questionId: 'qz', orderIndex: 4 }] }],
  ...over,
});

describe('POST /api/teacher/tests/collect-many', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requirePremiumTeacher.mockResolvedValue({ ok: true, userId: 't-teacher', role: 'TEACHER' });
    question.findMany.mockResolvedValue(usable('q1', 'q2', 'q3'));
    test.findFirst.mockResolvedValue(draft());
    test.create.mockImplementation(async ({ data }) => ({ id: 'new-test', title: data.title }));
  });

  it('starts a practice sheet with the questions in the order picked', async () => {
    const res = await post({ questionIds: ['q3', 'q1', 'q2'], newTitle: 'Practice sheet: Integrals', kind: 'sheet', marksPerQuestion: 2, negativeMarks: 0.5 });
    expect(res.status).toBe(201);
    const data = test.create.mock.calls[0][0].data;
    expect(data).toMatchObject({ title: 'Practice sheet: Integrals', templateType: 'WORKSHEET', isPublished: false, createdById: 't-teacher', totalMarks: 6, duration: 30, class: 'Class 12' });
    expect(data.sections.create[0]).toMatchObject({ title: 'Practice', marksPerQuestion: 2, negativeMarks: 0.5 });
    expect(data.sections.create[0].questions.create).toEqual([{ questionId: 'q3', orderIndex: 0 }, { questionId: 'q1', orderIndex: 1 }, { questionId: 'q2', orderIndex: 2 }]);
    expect(await res.json()).toMatchObject({ created: true, added: 3, refused: 0, questionCount: 3 });
  });

  it('starts a question paper, which is a test rather than a template, with the class asked for', async () => {
    await post({ questionIds: ['q1'], newTitle: 'Unit test', kind: 'paper', className: 'Class 11' });
    expect(test.create.mock.calls[0][0].data).toMatchObject({ templateType: null, duration: 60, class: 'Class 11', totalMarks: 1 });
  });

  it('only uses approved questions or the caller\'s own, and says how many it could not use', async () => {
    question.findMany.mockResolvedValue(usable('q1'));
    const res = await post({ questionIds: ['q1', 'draft-of-someone'], newTitle: 'Sheet' });
    expect(question.findMany.mock.calls[0][0].where).toMatchObject({ OR: [{ status: 'APPROVED', scope: 'PUBLIC' }, { createdById: 't-teacher' }] });
    expect(await res.json()).toMatchObject({ added: 1, refused: 1 });
    question.findMany.mockResolvedValue([]);
    expect((await post({ questionIds: ['draft-of-someone'], newTitle: 'Sheet' })).status).toBe(404);
  });

  it('adds to the end of an unpublished paper, skipping questions already in it', async () => {
    const res = await post({ questionIds: ['q1', 'q2', 'q3'], testId: 't1' });
    expect(res.status).toBe(200);
    expect(testQuestion.createMany).toHaveBeenCalledWith({ data: [{ sectionId: 's1', questionId: 'q2', orderIndex: 5 }, { sectionId: 's1', questionId: 'q3', orderIndex: 6 }] });
    expect(test.update).toHaveBeenCalledWith({ where: { id: 't1' }, data: { totalMarks: { increment: 4 } } });
    expect(await res.json()).toMatchObject({ created: false, added: 2, alreadyIn: 1, questionCount: 4 });
    expect(test.findFirst.mock.calls[0][0].where).toEqual({ id: 't1', createdById: 't-teacher' });
  });

  it('refuses a published or attempted paper, another teacher\'s, and a request without questions or a target', async () => {
    test.findFirst.mockResolvedValueOnce(draft({ isPublished: true }));
    expect((await post({ questionIds: ['q1'], testId: 't1' })).status).toBe(409);
    test.findFirst.mockResolvedValueOnce(draft({ _count: { attempts: 2 } }));
    expect((await post({ questionIds: ['q1'], testId: 't1' })).status).toBe(409);
    test.findFirst.mockResolvedValueOnce(null);
    expect((await post({ questionIds: ['q1'], testId: 'someone-else' })).status).toBe(404);
    expect((await post({ questionIds: [], newTitle: 'Sheet' })).status).toBe(400);
    expect((await post({ questionIds: ['q1'] })).status).toBe(400);
    expect(testQuestion.createMany).not.toHaveBeenCalled();
  });

  it('lets an admin add to any unpublished paper', async () => {
    requirePremiumTeacher.mockResolvedValue({ ok: true, userId: 'a1', role: 'ADMIN' });
    await post({ questionIds: ['q2'], testId: 't1' });
    expect(test.findFirst.mock.calls[0][0].where).toEqual({ id: 't1' });
  });
});
