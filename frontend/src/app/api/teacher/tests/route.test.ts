import { beforeEach, describe, expect, it, vi } from 'vitest';

const getServerSession = vi.fn();
const test = { create: vi.fn() };
const user = { findUnique: vi.fn() };

vi.mock('next-auth', () => ({ getServerSession }));
vi.mock('@/lib/auth', () => ({ authOptions: {} }));
vi.mock('@/lib/prisma', () => ({ default: { test, user } }));

const q = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `q${i + 1}` }));
const post = async (body: unknown) => { const { POST } = await import('./route'); return await POST(new Request('http://localhost/api/teacher/tests', { method: 'POST', body: JSON.stringify(body) })) as Response; };
const savedSections = () => test.create.mock.calls[0][0].data.sections.create as Array<{ negativeMarks: number; attemptLimit: number | null; marksPerQuestion: number }>;

describe('POST /api/teacher/tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getServerSession.mockResolvedValue({ user: { id: 't1', role: 'TEACHER' } });
    user.findUnique.mockResolvedValue({ subscription: 'PREMIUM' });
    test.create.mockResolvedValue({ id: 'test-1', sections: [] });
  });

  it('is for premium teachers only', async () => {
    user.findUnique.mockResolvedValue({ subscription: 'FREE' });
    expect((await post({ title: 'x', sections: [] })).status).toBe(403);
    expect(test.create).not.toHaveBeenCalled();
  });

  it('saves a pattern, per-section attempt limits and a genuine zero for negative marking', async () => {
    await post({
      title: 'JEE mock', duration: 60, totalMarks: 100, templateType: 'MOCK_EXAM', examPattern: 'JEE_MAIN_MATHS',
      sections: [
        { title: 'Section A', marksPerQuestion: 4, negativeMarks: 1, attemptLimit: null, questions: q(20) },
        { title: 'Section B', marksPerQuestion: 4, negativeMarks: 0, attemptLimit: 5, questions: q(10) },
      ],
    });
    const data = test.create.mock.calls[0][0].data;
    expect(data.examPattern).toBe('JEE_MAIN_MATHS');
    expect(data.templateType).toBe('MOCK_EXAM');
    // 0 means "no negative marking"; it must not silently become 1.
    expect(savedSections().map(s => [s.negativeMarks, s.attemptLimit])).toEqual([[1, null], [0, 5]]);
  });

  it('falls back to -1 only when negative marks are missing or unreadable, and never saves a negative penalty', async () => {
    await post({ title: 't', sections: [
      { title: 'A', marksPerQuestion: 4, questions: q(2) },
      { title: 'B', marksPerQuestion: 4, negativeMarks: 'oops', questions: q(2) },
      { title: 'C', marksPerQuestion: 4, negativeMarks: -3, questions: q(2) },
    ] });
    expect(savedSections().map(s => s.negativeMarks)).toEqual([1, 1, 0]);
  });

  it('ignores an unknown pattern, and an attempt limit that is not a positive whole number within the section', async () => {
    await post({ title: 't', examPattern: 'MADE_UP', sections: [
      { title: 'A', questions: q(10), attemptLimit: 11 },   // more than the section holds
      { title: 'B', questions: q(10), attemptLimit: 0 },
      { title: 'C', questions: q(10), attemptLimit: -2 },
      { title: 'D', questions: q(10), attemptLimit: 2.5 },
      { title: 'E', questions: q(10), attemptLimit: '5' },
      { title: 'F', questions: q(10), attemptLimit: 10 },   // exactly the section: allowed
    ] });
    expect(test.create.mock.calls[0][0].data.examPattern).toBeNull();
    expect(savedSections().map(s => s.attemptLimit)).toEqual([null, null, null, null, null, 10]);
  });
});
