import { beforeEach, describe, expect, it, vi } from 'vitest';

const getServerSession = vi.fn();
const studentFlashcard = { findMany: vi.fn(), create: vi.fn() };

vi.mock('next-auth', () => ({ getServerSession }));
vi.mock('@/lib/auth', () => ({ authOptions: {} }));
vi.mock('@/lib/prisma', () => ({ default: { studentFlashcard } }));

function post(body: unknown) {
  return new Request('http://localhost/api/student/flashcards/mine', { method: 'POST', body: JSON.stringify(body) });
}

describe('GET /api/student/flashcards/mine', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getServerSession.mockResolvedValue({ user: { id: 'student-1', role: 'STUDENT' } });
  });

  it('rejects non-student roles', async () => {
    getServerSession.mockResolvedValue({ user: { id: 'teacher-1', role: 'TEACHER' } });
    const { GET } = await import('./route');
    const response = await GET(new Request('http://localhost/api/student/flashcards/mine'));
    expect(response.status).toBe(401);
  });

  it('scopes cards to the caller', async () => {
    studentFlashcard.findMany.mockResolvedValue([]);
    const { GET } = await import('./route');
    await GET(new Request('http://localhost/api/student/flashcards/mine'));
    expect(studentFlashcard.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { userId: 'student-1' } }));
  });
});

describe('POST /api/student/flashcards/mine', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getServerSession.mockResolvedValue({ user: { id: 'student-1', role: 'STUDENT' } });
  });

  it('rejects a missing back', async () => {
    const { POST } = await import('./route');
    const response = await POST(post({ front: 'x' }));
    expect(response.status).toBe(400);
  });

  it('creates a flashcard', async () => {
    studentFlashcard.create.mockResolvedValue({ id: 'card-1', userId: 'student-1', front: 'x', back: 'y' });
    const { POST } = await import('./route');
    const response = await POST(post({ front: 'x^2 derivative?', back: '2x' }));
    expect(response.status).toBe(200);
  });
});
