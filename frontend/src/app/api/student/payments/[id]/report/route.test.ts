// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

const getServerSession = vi.fn();
const paymentRecord = { findFirst: vi.fn(), update: vi.fn() };
const notification = { create: vi.fn() };
const recordAuditLog = vi.fn();

vi.mock('next-auth', () => ({ getServerSession }));
vi.mock('@/lib/auth', () => ({ authOptions: {} }));
vi.mock('@/lib/prisma', () => ({ default: { paymentRecord, notification } }));
vi.mock('@/lib/audit-log', () => ({ recordAuditLog, requestAuditContext: () => ({}) }));

const report = async (body: unknown, id = 'p1') => {
  const { POST } = await import('./route');
  const req = new Request(`http://localhost/api/student/payments/${id}/report`, { method: 'POST', body: JSON.stringify(body) });
  return (await POST(req, { params: Promise.resolve({ id }) })) as Response;
};

const fee = (status: string) => ({
  id: 'p1', status, amount: 2500, description: 'Installment 1',
  enrollment: { batch: { teacherId: 't1', name: 'Class 12 Maths' } },
});

describe('POST /api/student/payments/[id]/report', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getServerSession.mockResolvedValue({ user: { id: 's1', role: 'STUDENT', name: 'Diya' } });
    paymentRecord.findFirst.mockResolvedValue(fee('UPCOMING'));
    paymentRecord.update.mockImplementation(async ({ data }) => ({ id: 'p1', ...data }));
  });

  it('marks the fee as waiting for confirmation, never as paid, and tells the teacher', async () => {
    const res = await report({ reference: '4335 1234 5678' });
    expect(res.status).toBe(200);
    expect(paymentRecord.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'p1' },
      data: { status: 'PENDING_VERIFICATION', transactionId: '433512345678', paymentMode: 'UPI' },
    }));
    expect(paymentRecord.update.mock.calls[0][0].data).not.toHaveProperty('paidAt');
    expect(notification.create.mock.calls[0][0].data).toMatchObject({ userId: 't1', title: 'Fee payment to confirm' });
    expect(recordAuditLog).toHaveBeenCalledWith(expect.objectContaining({ action: 'PAYMENT_REPORTED', entityId: 'p1' }));
  });

  it("looks the fee up among the student's own fees only", async () => {
    paymentRecord.findFirst.mockResolvedValue(null);
    const res = await report({ reference: '433512345678' }, 'someone-elses');
    expect(res.status).toBe(404);
    expect(paymentRecord.findFirst.mock.calls[0][0].where).toEqual({ id: 'someone-elses', enrollment: { studentId: 's1' } });
    expect(paymentRecord.update).not.toHaveBeenCalled();
  });

  it('refuses a fee that is already paid', async () => {
    paymentRecord.findFirst.mockResolvedValue(fee('PAID'));
    expect((await report({ reference: '433512345678' })).status).toBe(409);
    expect(paymentRecord.update).not.toHaveBeenCalled();
  });

  it('lets the student correct the reference while it is still waiting', async () => {
    paymentRecord.findFirst.mockResolvedValue(fee('PENDING_VERIFICATION'));
    expect((await report({ reference: '433512345679' })).status).toBe(200);
  });

  it('refuses a missing or malformed reference', async () => {
    expect((await report({ reference: 'paid' })).status).toBe(400);
    expect((await report({})).status).toBe(400);
    expect(paymentRecord.findFirst).not.toHaveBeenCalled();
  });

  it('is for signed-in students only', async () => {
    getServerSession.mockResolvedValue({ user: { id: 't1', role: 'TEACHER' } });
    expect((await report({ reference: '433512345678' })).status).toBe(401);
    getServerSession.mockResolvedValue(null);
    expect((await report({ reference: '433512345678' })).status).toBe(401);
  });
});
