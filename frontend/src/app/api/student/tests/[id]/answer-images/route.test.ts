// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

const getServerSession = vi.fn();
const testAttempt = { findFirst: vi.fn() };
const test = { findUnique: vi.fn() };
const testQuestion = { findFirst: vi.fn() };
const answerImage = { count: vi.fn(), create: vi.fn() };

vi.mock('next-auth', () => ({ getServerSession }));
vi.mock('@/lib/auth', () => ({ authOptions: {} }));
vi.mock('@/lib/prisma', () => ({ default: { testAttempt, test, testQuestion, answerImage } }));

const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 16, 0x4a, 0x46]);
const startedAgo = (seconds: number) => new Date(Date.now() - seconds * 1000);

async function upload(bytes: Uint8Array = JPEG, fields: Record<string, string> = { attemptId: 'a1', questionId: 'q1' }) {
  const form = new FormData();
  for (const [key, value] of Object.entries(fields)) form.set(key, value);
  form.set('file', new File([bytes as BlobPart], 'work.jpg', { type: 'image/jpeg' }));
  const { POST } = await import('./route');
  return POST(new Request('http://localhost/x', { method: 'POST', body: form }), { params: Promise.resolve({ id: 't1' }) });
}

describe('POST /api/student/tests/[id]/answer-images', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getServerSession.mockResolvedValue({ user: { id: 's1', role: 'STUDENT' } });
    testAttempt.findFirst.mockResolvedValue({ id: 'a1', startTime: startedAgo(600), examStartedAt: startedAgo(300) });
    test.findUnique.mockResolvedValue({ duration: 60 });
    testQuestion.findFirst.mockResolvedValue({ question: { type: 'LONG_ANSWER' } });
    answerImage.count.mockResolvedValue(0);
    answerImage.create.mockResolvedValue({ id: 'img1', size: JPEG.length });
  });

  it('stores a photo for a written question while the clock is running', async () => {
    const res = await upload();
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ id: 'img1', url: '/api/answer-images/img1' });
    expect(answerImage.create.mock.calls[0][0].data).toMatchObject({ attemptId: 'a1', questionId: 'q1', userId: 's1', mimeType: 'image/jpeg', size: JPEG.length });
    expect(testAttempt.findFirst).toHaveBeenCalledWith({ where: { id: 'a1', userId: 's1', testId: 't1', status: 'IN_PROGRESS' } });
  });

  it('judges the file by its bytes, not its name or claimed type', async () => {
    const html = new TextEncoder().encode('<html><script>alert(1)</script></html>');
    const res = await upload(html);
    expect(res.status).toBe(415);
    expect(answerImage.create).not.toHaveBeenCalled();
  });

  it('refuses a photo for a choice question, a fourth photo, and one after time is up', async () => {
    testQuestion.findFirst.mockResolvedValue({ question: { type: 'SINGLE_CHOICE' } });
    expect((await upload()).status).toBe(400);
    testQuestion.findFirst.mockResolvedValue({ question: { type: 'LONG_ANSWER' } });
    answerImage.count.mockResolvedValue(3);
    expect((await upload()).status).toBe(409);
    answerImage.count.mockResolvedValue(0);
    testAttempt.findFirst.mockResolvedValue({ id: 'a1', startTime: startedAgo(9000), examStartedAt: startedAgo(9000) });
    expect((await upload()).status).toBe(409);
    expect(answerImage.create).not.toHaveBeenCalled();
  });

  it('refuses a photo that is too large, a missing field, another role and an attempt that is not theirs', async () => {
    expect((await upload(new Uint8Array(3 * 1024 * 1024 + 1).fill(1))).status).toBe(413);
    expect((await upload(JPEG, { attemptId: 'a1' })).status).toBe(400);
    testAttempt.findFirst.mockResolvedValue(null);
    expect((await upload()).status).toBe(404);
    getServerSession.mockResolvedValue({ user: { id: 't', role: 'TEACHER' } });
    expect((await upload()).status).toBe(403);
  });
});
