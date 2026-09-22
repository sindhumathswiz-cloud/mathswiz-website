import { beforeEach, describe, expect, it, vi } from 'vitest';

const getServerSession = vi.fn();
const batchEnrollment = { findMany: vi.fn() };
const studentProgress = { findMany: vi.fn() };
const testAssignment = { findMany: vi.fn() };

vi.mock('next-auth', () => ({ getServerSession }));
vi.mock('@/lib/auth', () => ({ authOptions: {} }));
vi.mock('@/lib/prisma', () => ({ default: { batchEnrollment, studentProgress, testAssignment } }));

function get(qs = '?batchId=batch-1') {
  return new Request(`http://localhost/api/teacher/alerts${qs}`);
}

describe('GET /api/teacher/alerts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getServerSession.mockResolvedValue({ user: { id: 'teacher-1', role: 'TEACHER' } });
    batchEnrollment.findMany.mockResolvedValue([]);
    studentProgress.findMany.mockResolvedValue([]);
    testAssignment.findMany.mockResolvedValue([]);
  });

  it('rejects non-teacher roles', async () => {
    getServerSession.mockResolvedValue({ user: { id: 'parent-1', role: 'PARENT' } });
    const { GET } = await import('./route');
    expect((await GET(get())).status).toBe(401);
  });

  it('scopes the enrollment lookup to batches the caller owns', async () => {
    const { GET } = await import('./route');
    await GET(get());
    expect(batchEnrollment.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ batchId: 'batch-1', batch: { teacherId: 'teacher-1' } }),
    }));
  });

  it('only returns students who have at least one active alert', async () => {
    batchEnrollment.findMany.mockResolvedValue([
      { studentId: 'quiet-student', student: { id: 'quiet-student', firstName: 'A', lastName: 'One', lastActiveAt: new Date(), class: '11' } },
      { studentId: 'struggling-student', student: { id: 'struggling-student', firstName: 'B', lastName: 'Two', lastActiveAt: new Date(), class: '11' } },
    ]);
    studentProgress.findMany.mockResolvedValue([
      { userId: 'struggling-student', topic: 'Algebra', masteryScore: 10 },
    ]);
    const { GET } = await import('./route');
    const body = await (await GET(get())).json();
    expect(body.students).toHaveLength(1);
    expect(body.students[0].id).toBe('struggling-student');
    expect(body.students[0].alerts[0].type).toBe('REPEATED_DIFFICULTY');
  });
});
