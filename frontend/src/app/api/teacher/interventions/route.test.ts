import { beforeEach, describe, expect, it, vi } from 'vitest';

const getServerSession = vi.fn();
const recordAuditLog = vi.fn();
const batchEnrollment = { findFirst: vi.fn(), findMany: vi.fn() };
const intervention = { create: vi.fn(), findMany: vi.fn() };
const notification = { create: vi.fn() };
const studentProgress = { findMany: vi.fn() };
const transaction = vi.fn(async (callback) => callback({ intervention, notification }));

vi.mock('next-auth', () => ({ getServerSession }));
vi.mock('@/lib/auth', () => ({ authOptions: {} }));
vi.mock('@/lib/prisma', () => ({
  default: { batchEnrollment, intervention, notification, studentProgress, $transaction: transaction },
}));
vi.mock('@/lib/audit-log', () => ({ recordAuditLog, requestAuditContext: () => ({}) }));

describe('teacher interventions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getServerSession.mockResolvedValue({ user: { id: 'teacher-1', role: 'TEACHER' } });
    batchEnrollment.findFirst.mockResolvedValue({ id: 'enrollment-1' });
    intervention.create.mockResolvedValue({ id: 'intervention-1', studentId: 'student-1' });
  });

  it('assigns support within an owned batch and records the notification and audit', async () => {
    const { POST } = await import('./route');
    const response = await POST(new Request('http://localhost/api/teacher/interventions', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        studentId: 'student-1', batchId: 'batch-1', topic: 'Algebra',
        title: 'Algebra support', description: 'Complete targeted practice.', type: 'PRACTICE',
      }),
    }));

    expect(response.status).toBe(201);
    expect(batchEnrollment.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ studentId: 'student-1', batchId: 'batch-1', batch: { teacherId: 'teacher-1' } }),
    }));
    expect(intervention.create).toHaveBeenCalledWith({ data: expect.objectContaining({ teacherId: 'teacher-1', studentId: 'student-1' }) });
    expect(notification.create).toHaveBeenCalledWith({ data: expect.objectContaining({ userId: 'student-1', type: 'INTERVENTION' }) });
    expect(recordAuditLog).toHaveBeenCalledWith(expect.objectContaining({ action: 'INTERVENTION_ASSIGNED', entityId: 'intervention-1' }));
  });

  it('rejects a student outside the teacher owned batch', async () => {
    batchEnrollment.findFirst.mockResolvedValue(null);
    const { POST } = await import('./route');
    const response = await POST(new Request('http://localhost/api/teacher/interventions', {
      method: 'POST',
      body: JSON.stringify({ studentId: 'student-2', batchId: 'other-batch', topic: 'Geometry', title: 'Support', description: 'Review.' }),
    }));

    expect(response.status).toBe(404);
    expect(transaction).not.toHaveBeenCalled();
    expect(recordAuditLog).not.toHaveBeenCalled();
  });
});
