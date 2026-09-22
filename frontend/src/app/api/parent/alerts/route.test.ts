import { beforeEach, describe, expect, it, vi } from 'vitest';

const getServerSession = vi.fn();
const parentLink = { findFirst: vi.fn() };
const user = { findUnique: vi.fn() };
const studentProgress = { findMany: vi.fn() };
const batchEnrollment = { findMany: vi.fn() };
const testAssignment = { findMany: vi.fn() };

vi.mock('next-auth', () => ({ getServerSession }));
vi.mock('@/lib/auth', () => ({ authOptions: {} }));
vi.mock('@/lib/prisma', () => ({ default: { parentLink, user, studentProgress, batchEnrollment, testAssignment } }));

function get(qs = '?studentId=student-1') {
  return new Request(`http://localhost/api/parent/alerts${qs}`);
}

describe('GET /api/parent/alerts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getServerSession.mockResolvedValue({ user: { id: 'parent-1', role: 'PARENT' } });
    parentLink.findFirst.mockResolvedValue({ id: 'link-1' });
    user.findUnique.mockResolvedValue({ lastActiveAt: new Date(), class: '11' });
    studentProgress.findMany.mockResolvedValue([]);
    batchEnrollment.findMany.mockResolvedValue([]);
    testAssignment.findMany.mockResolvedValue([]);
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

  it('combines inactivity, difficulty, and upcoming-assessment signals', async () => {
    user.findUnique.mockResolvedValue({ lastActiveAt: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000), class: '11' });
    studentProgress.findMany.mockResolvedValue([{ topic: 'Algebra', masteryScore: 20 }]);
    testAssignment.findMany.mockResolvedValue([{ deadline: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000), test: { title: 'Mock Exam' } }]);
    const { GET } = await import('./route');
    const body = await (await GET(get())).json();
    expect(body.alerts.map((a: any) => a.type)).toEqual(['INACTIVITY', 'REPEATED_DIFFICULTY', 'UPCOMING_ASSESSMENT']);
  });

  it('returns an empty alerts array when nothing is alertable', async () => {
    const { GET } = await import('./route');
    const body = await (await GET(get())).json();
    expect(body.alerts).toEqual([]);
  });
});
