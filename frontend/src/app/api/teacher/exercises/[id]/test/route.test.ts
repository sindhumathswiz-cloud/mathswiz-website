// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

const getServerSession = vi.fn();
const requirePremiumTeacher = vi.fn();
const bookExercise = { findUnique: vi.fn() };
const question = { findMany: vi.fn() };
const test = { create: vi.fn() };

vi.mock('next-auth', () => ({ getServerSession }));
vi.mock('@/lib/auth', () => ({ authOptions: {} }));
vi.mock('@/lib/teacher-api-guard', () => ({ requirePremiumTeacher }));
vi.mock('@/lib/prisma', () => ({ default: { bookExercise, question, test } }));

const exercise = {
  id: 'ex-short', chapterId: 'ch-int', code: null, title: null, sectionType: 'SHORT_ANSWER', startPage: 247, endPage: 250,
  chapter: { id: 'ch-int', name: 'Integrals', bookId: 'b1', book: { title: 'Xam Idea Mathematics', className: 'Class 12' } },
};
const q = (id: string, page: number, printedNumber: string, extra: Record<string, unknown> = {}) =>
  ({ id, bookId: 'b1', bookChapterId: 'ch-int', bookExerciseId: null, sourcePageStart: page, printedNumber, createdAt: new Date(0), ...extra });

const call = async () => {
  const { POST } = await import('./route');
  return (await POST(new Request('http://localhost/api/teacher/exercises/ex-short/test', { method: 'POST' }), { params: Promise.resolve({ id: 'ex-short' }) })) as Response;
};

describe('POST /api/teacher/exercises/[id]/test', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requirePremiumTeacher.mockResolvedValue({ ok: true, userId: 't1', role: 'TEACHER' });
    bookExercise.findUnique.mockResolvedValue(exercise);
    test.create.mockImplementation(async ({ data }) => ({ id: 'test-1', title: data.title }));
  });

  it('makes an unpublished test of the exercise\'s approved questions in printed order', async () => {
    question.findMany.mockResolvedValue([q('q10', 248, '10'), q('q2', 248, '2'), q('q1', 247, '1'), q('outside', 260, '1'), q('linked', 999, '5', { bookExerciseId: 'ex-short' })]);
    const res = await call();
    expect(res.status).toBe(201);
    const data = test.create.mock.calls[0][0].data;
    expect(data.title).toBe('Integrals · Short answer');
    expect(data.isPublished).toBe(false);
    expect(data.class).toBe('Class 12');
    expect(data.totalMarks).toBe(4);
    expect(data.duration).toBe(15);
    const section = data.sections.create[0];
    expect(section).toMatchObject({ marksPerQuestion: 1, negativeMarks: 0 });
    expect(section.questions.create.map((x: { questionId: string }) => x.questionId)).toEqual(['q1', 'q2', 'q10', 'linked']);
    // Only approved, public questions of the book are considered.
    expect(question.findMany.mock.calls[0][0].where).toMatchObject({ bookId: 'b1', status: 'APPROVED', scope: 'PUBLIC' });
  });

  it('refuses an exercise with no approved questions, and an unknown one', async () => {
    question.findMany.mockResolvedValue([q('outside', 300, '1')]);
    expect((await call()).status).toBe(409);
    bookExercise.findUnique.mockResolvedValue(null);
    expect((await call()).status).toBe(404);
    expect(test.create).not.toHaveBeenCalled();
  });

  it('is for Premium teachers', async () => {
    requirePremiumTeacher.mockResolvedValue({ ok: false, response: new Response(JSON.stringify({ error: 'premium' }), { status: 403 }) });
    expect((await call()).status).toBe(403);
    expect(bookExercise.findUnique).not.toHaveBeenCalled();
  });
});
