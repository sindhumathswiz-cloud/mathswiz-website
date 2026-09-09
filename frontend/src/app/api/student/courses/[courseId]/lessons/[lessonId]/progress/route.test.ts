import { beforeEach, describe, expect, it, vi } from 'vitest';

const getServerSession = vi.fn();
const courseEnrollment = { findFirst: vi.fn() };
const lessonProgress = { upsert: vi.fn() };
vi.mock('next-auth', () => ({ getServerSession }));
vi.mock('@/lib/auth', () => ({ authOptions: {} }));
vi.mock('@/lib/prisma', () => ({ default: { courseEnrollment, lessonProgress } }));

describe('student lesson progress', () => {
  beforeEach(() => { vi.clearAllMocks(); getServerSession.mockResolvedValue({ user: { id: 'student-1', role: 'STUDENT' } }); courseEnrollment.findFirst.mockResolvedValue({ id: 'enrollment-1' }); lessonProgress.upsert.mockResolvedValue({ id: 'progress-1', completed: true }); });
  async function update() { const { PATCH } = await import('./route'); return PATCH(new Request('http://localhost/api/student/courses/course-1/lessons/lesson-1/progress', { method: 'PATCH', body: JSON.stringify({ completed: true }) }), { params: Promise.resolve({ courseId: 'course-1', lessonId: 'lesson-1' }) }); }
  it('updates progress only through an active published enrollment', async () => { expect((await update()).status).toBe(200); expect(courseEnrollment.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ courseId: 'course-1', studentId: 'student-1', status: 'ACTIVE' }) })); expect(lessonProgress.upsert).toHaveBeenCalledWith(expect.objectContaining({ where: { enrollmentId_lessonId: { enrollmentId: 'enrollment-1', lessonId: 'lesson-1' } } })); });
  it('rejects inaccessible lessons', async () => { courseEnrollment.findFirst.mockResolvedValue(null); expect((await update()).status).toBe(404); expect(lessonProgress.upsert).not.toHaveBeenCalled(); });
});
