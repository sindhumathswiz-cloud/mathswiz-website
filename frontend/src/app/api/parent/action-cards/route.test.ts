import { beforeEach, describe, expect, it, vi } from 'vitest';

const getServerSession = vi.fn();
const parentLink = { findFirst: vi.fn() };
const user = { findUnique: vi.fn() };
const studentProgress = { findMany: vi.fn() };
const batchEnrollment = { findMany: vi.fn() };
const testAssignment = { findMany: vi.fn() };
const testResponse = { findMany: vi.fn() };
const intervention = { findMany: vi.fn() };

vi.mock('next-auth', () => ({ getServerSession }));
vi.mock('@/lib/auth', () => ({ authOptions: {} }));
vi.mock('@/lib/prisma', () => ({
  default: { parentLink, user, studentProgress, batchEnrollment, testAssignment, testResponse, intervention },
}));

function get(qs = '?studentId=student-1') {
  return new Request(`http://localhost/api/parent/action-cards${qs}`);
}

describe('GET /api/parent/action-cards', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getServerSession.mockResolvedValue({ user: { id: 'parent-1', role: 'PARENT' } });
    parentLink.findFirst.mockResolvedValue({ id: 'link-1' });
    user.findUnique.mockResolvedValue({ lastActiveAt: new Date(), class: '11' });
    studentProgress.findMany.mockResolvedValue([]);
    batchEnrollment.findMany.mockResolvedValue([]);
    testAssignment.findMany.mockResolvedValue([]);
    testResponse.findMany.mockResolvedValue([]);
    intervention.findMany.mockResolvedValue([]);
  });

  it('rejects non-parent roles', async () => {
    getServerSession.mockResolvedValue({ user: { id: 'teacher-1', role: 'TEACHER' } });
    const { GET } = await import('./route');
    expect((await GET(get())).status).toBe(401);
  });

  it('rejects a studentId not linked to this parent', async () => {
    parentLink.findFirst.mockResolvedValue(null);
    const { GET } = await import('./route');
    expect((await GET(get())).status).toBe(403);
  });

  it('returns the empty-state card when nothing is alertable and no comments exist', async () => {
    const { GET } = await import('./route');
    const body = await (await GET(get())).json();
    expect(body.cards).toHaveLength(1);
    expect(body.cards[0].tone).toBe('success');
  });

  it('surfaces a repeated-difficulty card from StudentProgress', async () => {
    studentProgress.findMany.mockResolvedValue([{ topic: 'Algebra', masteryScore: 15 }]);
    const { GET } = await import('./route');
    const body = await (await GET(get())).json();
    expect(body.cards.some((c: any) => c.detail === 'Algebra')).toBe(true);
  });

  it('surfaces the most recent teacher comment as its own card', async () => {
    testResponse.findMany.mockResolvedValue([
      { teacherFeedback: 'Great job', reviewedAt: new Date(), attempt: { test: { title: 'Algebra Test' } } },
    ]);
    const { GET } = await import('./route');
    const body = await (await GET(get())).json();
    expect(body.cards.some((c: any) => c.detail === 'Great job')).toBe(true);
  });
});
