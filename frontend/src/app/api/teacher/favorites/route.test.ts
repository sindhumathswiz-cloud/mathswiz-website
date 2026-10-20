// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

const getServerSession = vi.fn();
const requirePremiumTeacher = vi.fn();
const teacherFavorite = { findMany: vi.fn(), upsert: vi.fn(), deleteMany: vi.fn() };
const question = { findMany: vi.fn(), count: vi.fn() };

vi.mock('next-auth', () => ({ getServerSession }));
vi.mock('@/lib/auth', () => ({ authOptions: {} }));
vi.mock('@/lib/teacher-api-guard', () => ({ requirePremiumTeacher }));
vi.mock('@/lib/prisma', () => ({ default: { teacherFavorite, question } }));

const route = () => import('./route');

describe('/api/teacher/favorites', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requirePremiumTeacher.mockResolvedValue({ ok: true, userId: 't1', role: 'TEACHER' });
    question.count.mockResolvedValue(1);
  });

  it('bookmarks a question the teacher can see, once', async () => {
    const { POST } = await route();
    const res = await POST(new Request('http://x/api/teacher/favorites', { method: 'POST', body: JSON.stringify({ questionId: 'q1' }) })) as Response;
    expect(res.status).toBe(200);
    expect(teacherFavorite.upsert).toHaveBeenCalledWith({ where: { teacherId_questionId: { teacherId: 't1', questionId: 'q1' } }, update: {}, create: { teacherId: 't1', questionId: 'q1' } });
    question.count.mockResolvedValue(0);
    expect((await POST(new Request('http://x', { method: 'POST', body: JSON.stringify({ questionId: 'hidden' }) })) as Response).status).toBe(404);
  });

  it('removes only the teacher\'s own bookmark', async () => {
    const { DELETE } = await route();
    await DELETE(new Request('http://x/api/teacher/favorites?questionId=q1', { method: 'DELETE' }));
    expect(teacherFavorite.deleteMany).toHaveBeenCalledWith({ where: { teacherId: 't1', questionId: 'q1' } });
  });

  it('lists bookmarks newest first, dropping questions no longer available', async () => {
    teacherFavorite.findMany.mockResolvedValue([{ questionId: 'q2' }, { questionId: 'gone' }, { questionId: 'q1' }]);
    question.findMany.mockResolvedValue([{ id: 'q1', content: 'one' }, { id: 'q2', content: 'two' }]);
    const { GET } = await route();
    const body = await (await GET() as Response).json();
    expect(body.questions.map((q: { id: string }) => q.id)).toEqual(['q2', 'q1']);
  });

  it('is for Premium teachers', async () => {
    requirePremiumTeacher.mockResolvedValue({ ok: false, response: new Response('{}', { status: 403 }) });
    const { GET } = await route();
    expect((await GET() as Response).status).toBe(403);
  });
});
