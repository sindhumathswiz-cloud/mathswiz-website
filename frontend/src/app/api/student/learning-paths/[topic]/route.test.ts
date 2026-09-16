import { beforeEach, describe, expect, it, vi } from 'vitest';

const getServerSession = vi.fn();
const learningPathProgress = { findUnique: vi.fn() };
const question = { findMany: vi.fn() };

vi.mock('next-auth', () => ({ getServerSession }));
vi.mock('@/lib/auth', () => ({ authOptions: {} }));
vi.mock('@/lib/prisma', () => ({ default: { learningPathProgress, question } }));

const params = (topic: string) => Promise.resolve({ topic });

describe('GET /api/student/learning-paths/[topic]', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getServerSession.mockResolvedValue({ user: { id: 'student-1', role: 'STUDENT' } });
  });

  it('rejects non-student roles', async () => {
    getServerSession.mockResolvedValue({ user: { id: 'teacher-1', role: 'TEACHER' } });
    const { GET } = await import('./route');
    const response = await GET(new Request('http://localhost'), { params: params('Algebra') });
    expect(response.status).toBe(401);
  });

  it('defaults to EXAMPLES with no progress row', async () => {
    learningPathProgress.findUnique.mockResolvedValue(null);
    question.findMany.mockResolvedValue([{ id: 'q-1', content: 'x', explanation: 'y', difficulty: 'EASY' }]);
    const { GET } = await import('./route');
    const response = await GET(new Request('http://localhost'), { params: params('Algebra') });
    const body = await response.json();
    expect(body.stage).toBe('EXAMPLES');
    expect(body.examples).toHaveLength(1);
  });

  it('decodes a URL-encoded topic with spaces', async () => {
    learningPathProgress.findUnique.mockResolvedValue(null);
    question.findMany.mockResolvedValue([]);
    const { GET } = await import('./route');
    const response = await GET(new Request('http://localhost'), { params: params(encodeURIComponent('Linear Programming')) });
    const body = await response.json();
    expect(body.topic).toBe('Linear Programming');
    expect(question.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ topic: 'Linear Programming' }) }));
  });
});
