// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

const getServerSession = vi.fn();
const studentSmartbookAccess = vi.fn();
const question = { findFirst: vi.fn() };
const testResponse = { count: vi.fn() };

vi.mock('next-auth', () => ({ getServerSession }));
vi.mock('@/lib/auth', () => ({ authOptions: {} }));
vi.mock('@/lib/smartbook-data', () => ({ studentSmartbookAccess }));
vi.mock('@/lib/prisma', () => ({ default: { question, testResponse } }));

const get = async (id = 'q1') => {
  const { GET } = await import('./route');
  return (await GET(new Request(`http://localhost/api/student/smartbook/questions/${id}/solution`), { params: Promise.resolve({ id }) })) as Response;
};

describe('GET /api/student/smartbook/questions/[id]/solution', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getServerSession.mockResolvedValue({ user: { id: 's1', role: 'STUDENT' } });
    studentSmartbookAccess.mockResolvedValue({ premium: true, className: 'Class 12' });
    question.findFirst.mockResolvedValue({ id: 'q1', type: 'SINGLE_CHOICE', correctAnswer: 'B', explanation: 'Because…' });
    testResponse.count.mockResolvedValue(0);
  });

  it('keeps a markable answer back until the student has answered', async () => {
    const res = await get();
    expect(res.status).toBe(409);
    expect(testResponse.count).toHaveBeenCalledWith({ where: { questionId: 'q1', attempt: { userId: 's1' } } });
  });

  it('gives the answer and working once they have', async () => {
    testResponse.count.mockResolvedValue(1);
    const res = await get();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ correctAnswer: 'B', explanation: 'Because…' });
  });

  it('shows a written question\'s answer on request, for self-checking', async () => {
    question.findFirst.mockResolvedValue({ id: 'q1', type: 'SUBJECTIVE', correctAnswer: null, explanation: 'Proof…' });
    const res = await get();
    expect(res.status).toBe(200);
    expect(testResponse.count).not.toHaveBeenCalled();
  });

  it('only for an approved question of a Smartbook in the student\'s class', async () => {
    await get();
    expect(question.findFirst.mock.calls[0][0].where).toEqual({
      id: 'q1', status: 'APPROVED', scope: 'PUBLIC',
      book: { smartbookPublishedAt: { not: null }, isActive: true, className: 'Class 12' },
    });
    question.findFirst.mockResolvedValue(null);
    expect((await get()).status).toBe(404);
  });

  it('is for Premium students only', async () => {
    studentSmartbookAccess.mockResolvedValue({ premium: false, className: 'Class 12' });
    expect((await get()).status).toBe(403);
    getServerSession.mockResolvedValue({ user: { id: 't1', role: 'TEACHER' } });
    expect((await get()).status).toBe(401);
    expect(question.findFirst).not.toHaveBeenCalled();
  });
});
