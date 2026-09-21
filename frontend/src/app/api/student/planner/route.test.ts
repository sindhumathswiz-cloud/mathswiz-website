import { beforeEach, describe, expect, it, vi } from 'vitest';

const getServerSession = vi.fn();
const spacedRepetitionCard = { findMany: vi.fn() };
const batchEnrollment = { findMany: vi.fn() };
const intervention = { findMany: vi.fn() };
const testAssignment = { findMany: vi.fn() };

vi.mock('next-auth', () => ({ getServerSession }));
vi.mock('@/lib/auth', () => ({ authOptions: {} }));
vi.mock('@/lib/prisma', () => ({ default: { spacedRepetitionCard, batchEnrollment, intervention, testAssignment } }));

async function call() {
  const { GET } = await import('./route');
  return GET();
}

describe('GET /api/student/planner', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getServerSession.mockResolvedValue({ user: { id: 'student-1', role: 'STUDENT', class: '11' } });
    spacedRepetitionCard.findMany.mockResolvedValue([]);
    batchEnrollment.findMany.mockResolvedValue([]);
    intervention.findMany.mockResolvedValue([]);
    testAssignment.findMany.mockResolvedValue([]);
  });

  it('rejects non-student roles', async () => {
    getServerSession.mockResolvedValue({ user: { id: 'teacher-1', role: 'TEACHER' } });
    const response = await call();
    expect(response.status).toBe(401);
  });

  it('returns 7 empty-ish buckets and no Overdue bucket when nothing is due', async () => {
    const body = await (await call()).json();
    expect(body.buckets).toHaveLength(7);
    expect(body.buckets.every((b: any) => b.items.length === 0)).toBe(true);
  });

  it('includes a due question review card, truncated and linked to mistakes review', async () => {
    spacedRepetitionCard.findMany.mockImplementation(({ where }: any) =>
      Promise.resolve(
        'questionId' in where
          ? [{ id: 'card-1', dueAt: new Date(), question: { id: 'q-1', content: 'x'.repeat(100) } }]
          : []
      )
    );
    const body = await (await call()).json();
    const item = body.buckets[0].items.find((i: any) => i.type === 'QUESTION_REVIEW');
    expect(item).toBeDefined();
    expect(item.title.length).toBeLessThanOrEqual(70);
    expect(item.href).toBe('/student/practice?mode=mistakes');
  });

  it('includes a due flashcard review card linked to due-only study mode', async () => {
    spacedRepetitionCard.findMany.mockImplementation(({ where }: any) =>
      Promise.resolve(
        'flashcardId' in where
          ? [{ id: 'card-2', dueAt: new Date(), flashcard: { id: 'fc-1', front: 'derivative of x^2' } }]
          : []
      )
    );
    const body = await (await call()).json();
    const item = body.buckets[0].items.find((i: any) => i.type === 'FLASHCARD_REVIEW');
    expect(item.title).toBe('derivative of x^2');
    expect(item.href).toBe('/student/flashcards/study?mode=due');
  });

  it('excludes a test assignment whose max attempts are already used', async () => {
    testAssignment.findMany.mockResolvedValue([{
      id: 'assign-1', deadline: new Date(), maxAttempts: 1,
      test: { id: 'test-1', title: 'Algebra Test', attempts: [{ id: 'a1' }] },
    }]);
    const body = await (await call()).json();
    const allItems = body.buckets.flatMap((b: any) => b.items);
    expect(allItems.find((i: any) => i.type === 'TEST')).toBeUndefined();
  });

  it('includes an open test assignment as a TEST item', async () => {
    testAssignment.findMany.mockResolvedValue([{
      id: 'assign-1', deadline: new Date(), maxAttempts: 1,
      test: { id: 'test-1', title: 'Algebra Test', attempts: [] },
    }]);
    const body = await (await call()).json();
    const allItems = body.buckets.flatMap((b: any) => b.items);
    const item = allItems.find((i: any) => i.type === 'TEST');
    expect(item.title).toBe('Algebra Test');
  });

  it('includes a due intervention as an INTERVENTION item', async () => {
    intervention.findMany.mockResolvedValue([{ id: 'int-1', title: 'Extra Geometry practice', dueDate: new Date() }]);
    const body = await (await call()).json();
    const allItems = body.buckets.flatMap((b: any) => b.items);
    const item = allItems.find((i: any) => i.type === 'INTERVENTION');
    expect(item.title).toBe('Extra Geometry practice');
    expect(item.href).toBe('/student/interventions');
  });
});
