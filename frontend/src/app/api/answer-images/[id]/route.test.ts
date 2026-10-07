import { beforeEach, describe, expect, it, vi } from 'vitest';

const getServerSession = vi.fn();
const answerImage = { findUnique: vi.fn() };
const test = { findFirst: vi.fn() };

vi.mock('next-auth', () => ({ getServerSession }));
vi.mock('@/lib/auth', () => ({ authOptions: {} }));
vi.mock('@/lib/prisma', () => ({ default: { answerImage, test } }));

const get = async () => {
  const { GET } = await import('./route');
  return GET(new Request('http://localhost/api/answer-images/img1'), { params: Promise.resolve({ id: 'img1' }) });
};

describe('GET /api/answer-images/[id]', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    answerImage.findUnique.mockResolvedValue({ mimeType: 'image/jpeg', bytes: Buffer.from([0xff, 0xd8, 0xff]), userId: 'student-1', attempt: { testId: 'test-1' } });
    test.findFirst.mockResolvedValue(null);
  });

  it('serves the photo to the student who took it, with headers that stop it being run as anything else', async () => {
    getServerSession.mockResolvedValue({ user: { id: 'student-1', role: 'STUDENT' } });
    const res = await get();
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toBe('image/jpeg');
    expect(res.headers.get('X-Content-Type-Options')).toBe('nosniff');
    expect(res.headers.get('Cache-Control')).toContain('private');
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(new Uint8Array([0xff, 0xd8, 0xff]));
  });

  it('serves it to an admin, and to a teacher who may mark that test', async () => {
    getServerSession.mockResolvedValue({ user: { id: 'admin-1', role: 'ADMIN' } });
    expect((await get()).status).toBe(200);
    getServerSession.mockResolvedValue({ user: { id: 'teacher-1', role: 'TEACHER' } });
    test.findFirst.mockResolvedValue({ id: 'test-1' });
    expect((await get()).status).toBe(200);
    expect(JSON.stringify(test.findFirst.mock.calls[0][0])).toContain('teacher-1');
  });

  it('answers "not found" to another student, to an unrelated teacher and to a missing photo alike', async () => {
    getServerSession.mockResolvedValue({ user: { id: 'student-2', role: 'STUDENT' } });
    expect((await get()).status).toBe(404);
    getServerSession.mockResolvedValue({ user: { id: 'teacher-2', role: 'TEACHER' } });
    expect((await get()).status).toBe(404);
    answerImage.findUnique.mockResolvedValue(null);
    getServerSession.mockResolvedValue({ user: { id: 'student-1', role: 'STUDENT' } });
    expect((await get()).status).toBe(404);
  });

  it('requires a session', async () => {
    getServerSession.mockResolvedValue(null);
    expect((await get()).status).toBe(401);
  });
});
