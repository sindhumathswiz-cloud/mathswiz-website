import { beforeEach, describe, expect, it, vi } from 'vitest';

const getServerSession = vi.fn();
const studentFlashcard = { findFirst: vi.fn() };
const spacedRepetitionCard = { findUnique: vi.fn(), upsert: vi.fn() };

vi.mock('next-auth', () => ({ getServerSession }));
vi.mock('@/lib/auth', () => ({ authOptions: {} }));
vi.mock('@/lib/prisma', () => ({ default: { studentFlashcard, spacedRepetitionCard } }));

function post(body: unknown) {
  return new Request('http://localhost/api/student/flashcards/review', { method: 'POST', body: JSON.stringify(body) });
}

describe('POST /api/student/flashcards/review', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getServerSession.mockResolvedValue({ user: { id: 'student-1', role: 'STUDENT' } });
    studentFlashcard.findFirst.mockResolvedValue({ id: 'card-1' });
    spacedRepetitionCard.findUnique.mockResolvedValue(null);
    spacedRepetitionCard.upsert.mockResolvedValue({ id: 'srs-1' });
  });

  it('rejects non-student roles', async () => {
    getServerSession.mockResolvedValue({ user: { id: 'teacher-1', role: 'TEACHER' } });
    const response = await (await import('./route')).POST(post({ flashcardId: 'card-1', grade: 'GOOD' }));
    expect(response.status).toBe(401);
  });

  it('rejects an invalid grade', async () => {
    const response = await (await import('./route')).POST(post({ flashcardId: 'card-1', grade: 'WHATEVER' }));
    expect(response.status).toBe(400);
  });

  it("rejects a flashcard that isn't the caller's own", async () => {
    studentFlashcard.findFirst.mockResolvedValue(null);
    const response = await (await import('./route')).POST(post({ flashcardId: 'someone-elses-card', grade: 'GOOD' }));
    expect(response.status).toBe(404);
    expect(studentFlashcard.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'someone-elses-card', userId: 'student-1' },
    }));
  });

  it('creates a fresh SM-2 schedule on a first review with a passing grade, no lapse recorded', async () => {
    const { POST } = await import('./route');
    await POST(post({ flashcardId: 'card-1', grade: 'GOOD' }));

    expect(spacedRepetitionCard.upsert).toHaveBeenCalledWith(expect.objectContaining({
      where: { userId_flashcardId: { userId: 'student-1', flashcardId: 'card-1' } },
      create: expect.objectContaining({ userId: 'student-1', flashcardId: 'card-1', lapses: 0, repetitions: 1, intervalDays: 1 }),
    }));
  });

  it('records a lapse and resets the interval to 1 day on an AGAIN grade', async () => {
    const { POST } = await import('./route');
    await POST(post({ flashcardId: 'card-1', grade: 'AGAIN' }));

    expect(spacedRepetitionCard.upsert).toHaveBeenCalledWith(expect.objectContaining({
      create: expect.objectContaining({ lapses: 1, repetitions: 0, intervalDays: 1 }),
    }));
  });

  it('increments the existing lapse count (not resets it) on a repeat failing grade', async () => {
    spacedRepetitionCard.findUnique.mockResolvedValue({
      easinessFactor: 2.2, intervalDays: 6, repetitions: 2, lapses: 3, dueAt: new Date(),
    });
    const { POST } = await import('./route');
    await POST(post({ flashcardId: 'card-1', grade: 'AGAIN' }));

    expect(spacedRepetitionCard.upsert).toHaveBeenCalledWith(expect.objectContaining({
      update: expect.objectContaining({ lapses: 4, repetitions: 0 }),
    }));
  });
});
