import { beforeEach, describe, expect, it, vi } from 'vitest';

const getServerSession = vi.fn();
const masteryEvent = { findMany: vi.fn() };
const mistakeNotebookEntry = { findMany: vi.fn(), upsert: vi.fn() };
const question = { findMany: vi.fn(), findFirst: vi.fn() };

vi.mock('next-auth', () => ({ getServerSession }));
vi.mock('@/lib/auth', () => ({ authOptions: {} }));
vi.mock('@/lib/prisma', () => ({ default: { masteryEvent, mistakeNotebookEntry, question } }));

const hoursAgo = (h: number) => new Date(Date.now() - h * 60 * 60 * 1000);

function post(body: unknown) {
  return new Request('http://localhost/api/student/mistakes/notebook', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

describe('GET /api/student/mistakes/notebook', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getServerSession.mockResolvedValue({ user: { id: 'student-1', role: 'STUDENT' } });
    masteryEvent.findMany.mockResolvedValue([]);
    mistakeNotebookEntry.findMany.mockResolvedValue([]);
  });

  it('rejects non-student roles', async () => {
    getServerSession.mockResolvedValue({ user: { id: 'teacher-1', role: 'TEACHER' } });
    const { GET } = await import('./route');
    const response = await GET();
    expect(response.status).toBe(401);
  });

  it('returns an empty list when nothing is wrong or flagged', async () => {
    const { GET } = await import('./route');
    const response = await GET();
    const body = await response.json();
    expect(body.entries).toEqual([]);
    expect(question.findMany).not.toHaveBeenCalled();
  });

  it('marks a question missed via auto-capture as source "auto"', async () => {
    masteryEvent.findMany.mockResolvedValue([
      { questionId: 'q-auto', isCorrect: false, createdAt: hoursAgo(200) },
    ]);
    question.findMany.mockResolvedValue([{ id: 'q-auto', content: 'x', topic: 'Algebra', subject: 'Math', difficulty: 'MEDIUM' }]);
    const { GET } = await import('./route');
    const response = await GET();
    const body = await response.json();
    expect(body.entries).toHaveLength(1);
    expect(body.entries[0].source).toBe('auto');
    expect(body.entries[0].dueAt).not.toBeNull();
  });

  it('marks an explicitly pinned question as source "flagged"', async () => {
    mistakeNotebookEntry.findMany.mockResolvedValue([
      { id: 'entry-1', userId: 'student-1', questionId: 'q-flag', note: 'watch this', createdAt: new Date() },
    ]);
    question.findMany.mockResolvedValue([{ id: 'q-flag', content: 'x', topic: 'Algebra', subject: 'Math', difficulty: 'MEDIUM' }]);
    const { GET } = await import('./route');
    const response = await GET();
    const body = await response.json();
    expect(body.entries).toHaveLength(1);
    expect(body.entries[0].source).toBe('flagged');
    expect(body.entries[0].dueAt).toBeNull();
    expect(body.entries[0].note).toBe('watch this');
  });

  it('dedupes a question that is both wrong and flagged into source "both"', async () => {
    masteryEvent.findMany.mockResolvedValue([
      { questionId: 'q-both', isCorrect: false, createdAt: hoursAgo(200) },
    ]);
    mistakeNotebookEntry.findMany.mockResolvedValue([
      { id: 'entry-1', userId: 'student-1', questionId: 'q-both', note: null, createdAt: new Date() },
    ]);
    question.findMany.mockResolvedValue([{ id: 'q-both', content: 'x', topic: 'Algebra', subject: 'Math', difficulty: 'MEDIUM' }]);
    const { GET } = await import('./route');
    const response = await GET();
    const body = await response.json();
    expect(body.entries).toHaveLength(1);
    expect(body.entries[0].source).toBe('both');
  });
});

describe('POST /api/student/mistakes/notebook', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getServerSession.mockResolvedValue({ user: { id: 'student-1', role: 'STUDENT' } });
  });

  it('rejects non-student roles', async () => {
    getServerSession.mockResolvedValue({ user: { id: 'teacher-1', role: 'TEACHER' } });
    const { POST } = await import('./route');
    const response = await POST(post({ questionId: 'q-1' }));
    expect(response.status).toBe(401);
  });

  it('rejects a missing questionId', async () => {
    const { POST } = await import('./route');
    const response = await POST(post({}));
    expect(response.status).toBe(400);
  });

  it('404s for a question that does not exist or is not visible', async () => {
    question.findFirst.mockResolvedValue(null);
    const { POST } = await import('./route');
    const response = await POST(post({ questionId: 'q-missing' }));
    expect(response.status).toBe(404);
    expect(mistakeNotebookEntry.upsert).not.toHaveBeenCalled();
  });

  it('upserts a flag for a valid question (idempotent flagging)', async () => {
    question.findFirst.mockResolvedValue({ id: 'q-1' });
    mistakeNotebookEntry.upsert.mockResolvedValue({ id: 'entry-1', userId: 'student-1', questionId: 'q-1' });
    const { POST } = await import('./route');
    const response = await POST(post({ questionId: 'q-1', note: 'careful with signs' }));
    expect(response.status).toBe(200);
    expect(mistakeNotebookEntry.upsert).toHaveBeenCalledWith({
      where: { userId_questionId: { userId: 'student-1', questionId: 'q-1' } },
      update: { note: 'careful with signs' },
      create: { userId: 'student-1', questionId: 'q-1', note: 'careful with signs' },
    });
  });
});
