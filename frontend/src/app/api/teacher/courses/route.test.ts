import { beforeEach, describe, expect, it, vi } from 'vitest';

const getServerSession = vi.fn();
const recordAuditLog = vi.fn();
const course = { findMany: vi.fn(), create: vi.fn() };
vi.mock('next-auth', () => ({ getServerSession }));
vi.mock('@/lib/auth', () => ({ authOptions: {} }));
vi.mock('@/lib/prisma', () => ({ default: { course } }));
vi.mock('@/lib/audit-log', () => ({ recordAuditLog, requestAuditContext: () => ({}) }));

describe('teacher courses', () => {
  beforeEach(() => { vi.clearAllMocks(); getServerSession.mockResolvedValue({ user: { id: 'teacher-1', role: 'TEACHER' } }); course.findMany.mockResolvedValue([]); course.create.mockResolvedValue({ id: 'course-1', title: 'Algebra' }); });
  it('scopes course lists to the teacher', async () => { const { GET } = await import('./route'); expect((await GET()).status).toBe(200); expect(course.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { createdById: 'teacher-1' } })); });
  it('creates and audits a valid course', async () => { const { POST } = await import('./route'); const response = await POST(new Request('http://localhost/api/teacher/courses', { method: 'POST', body: JSON.stringify({ title: 'Algebra Foundations', class: 'Class 9' }) })); expect(response.status).toBe(201); expect(course.create).toHaveBeenCalledWith({ data: expect.objectContaining({ createdById: 'teacher-1', title: 'Algebra Foundations' }) }); expect(recordAuditLog).toHaveBeenCalledWith(expect.objectContaining({ action: 'COURSE_CREATED' })); });
  it('rejects students', async () => { getServerSession.mockResolvedValue({ user: { id: 'student-1', role: 'STUDENT' } }); const { GET } = await import('./route'); expect((await GET()).status).toBe(401); });
});
