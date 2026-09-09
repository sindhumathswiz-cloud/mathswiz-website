import { beforeEach, describe, expect, it, vi } from 'vitest';

const getServerSession = vi.fn();
const batchEnrollment = { findMany: vi.fn() };
const studentProgress = { findMany: vi.fn() };
vi.mock('next-auth', () => ({ getServerSession }));
vi.mock('@/lib/auth', () => ({ authOptions: {} }));
vi.mock('@/lib/prisma', () => ({ default: { batchEnrollment, studentProgress } }));

describe('teacher mastery view', () => {
  beforeEach(() => { vi.clearAllMocks(); getServerSession.mockResolvedValue({ user: { id: 'teacher-1', role: 'TEACHER' } }); batchEnrollment.findMany.mockResolvedValue([{ studentId: 'student-1', student: { id: 'student-1', firstName: 'A', lastName: null } }]); studentProgress.findMany.mockResolvedValue([]); });
  it('scopes batch mastery to the teacher’s approved enrollments', async () => { const { GET } = await import('./route'); const response = await GET(new Request('http://localhost/api/teacher/mastery?batchId=batch-1')); expect(response.status).toBe(200); expect(batchEnrollment.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ batchId: 'batch-1', status: 'APPROVED', batch: { teacherId: 'teacher-1' } }) })); expect(studentProgress.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { userId: { in: ['student-1'] } } })); });
  it('does not expose students outside the teacher’s batches', async () => { batchEnrollment.findMany.mockResolvedValue([]); const { GET } = await import('./route'); expect((await GET(new Request('http://localhost/api/teacher/mastery?studentId=other'))).status).toBe(404); expect(studentProgress.findMany).not.toHaveBeenCalled(); });
});
