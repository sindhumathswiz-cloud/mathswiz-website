import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('next-auth', () => ({ getServerSession: vi.fn() }));
vi.mock('@/lib/auth', () => ({ authOptions: {} }));

const recordAuditLog = vi.fn();
vi.mock('@/lib/audit-log', () => ({ recordAuditLog, requestAuditContext: () => ({}) }));

const mockPrisma = {
  question: { findUnique: vi.fn(), update: vi.fn(), groupBy: vi.fn() },
  questionFlag: { findFirst: vi.fn(), findUnique: vi.fn(), create: vi.fn(), update: vi.fn(), count: vi.fn(), findMany: vi.fn(), groupBy: vi.fn() },
  notification: { create: vi.fn() },
  $transaction: vi.fn(),
};
vi.mock('@/lib/prisma', () => ({ default: mockPrisma }));

const post = (body: unknown) => new Request('http://localhost/api/admin/question-flags', { method: 'POST', body: JSON.stringify(body) });
const patch = (body: unknown) => new Request('http://localhost/api/admin/question-flags/f-1', { method: 'PATCH', body: JSON.stringify(body) });
const params = Promise.resolve({ id: 'f-1' });

beforeEach(async () => {
  vi.clearAllMocks();
  const { getServerSession } = await import('next-auth');
  vi.mocked(getServerSession).mockResolvedValue({ user: { id: 'admin-1', role: 'ADMIN' } } as never);
  mockPrisma.$transaction.mockImplementation(async (fn: (tx: typeof mockPrisma) => unknown) => fn(mockPrisma));
  mockPrisma.questionFlag.update.mockResolvedValue({ id: 'f-1' });
});

describe('GET /api/admin/question-flags', () => {
  it('filters flags by status, who raised them and the question filters, one page at a time, with counts per status', async () => {
    const { GET } = await import('./route');
    mockPrisma.questionFlag.count.mockResolvedValue(26);
    mockPrisma.questionFlag.findMany.mockResolvedValue([{ id: 'f-1' }]);
    mockPrisma.questionFlag.groupBy.mockResolvedValue([{ status: 'PENDING', _count: { _all: 26 } }]);
    mockPrisma.question.groupBy.mockResolvedValue([]);
    const res = await GET(new Request('http://localhost/api/admin/question-flags?status=PENDING&raisedBy=review&q=matrix&types=SHORT_ANSWER&page=2&facets=1'));
    const data = await res.json();
    expect(data).toMatchObject({ total: 26, page: 2, statusCounts: { PENDING: 26 }, facets: { types: [] } });
    const call = mockPrisma.questionFlag.findMany.mock.calls[0][0];
    expect(call).toMatchObject({ skip: 25, take: 25, where: { status: 'PENDING', flaggedBy: { role: { not: 'STUDENT' } } } });
    // The question filters apply to the flagged question, whatever its own status (archived ones aside).
    expect(call.where.question.AND).toEqual(expect.arrayContaining([
      { status: { not: 'ARCHIVED' } }, { content: { contains: 'matrix', mode: 'insensitive' } }, { type: { in: ['SHORT_ANSWER'] } },
    ]));
    expect(call.where.question.AND).not.toContainEqual({ status: 'APPROVED' });
    // The status counts keep every filter but the status.
    expect(mockPrisma.questionFlag.groupBy.mock.calls[0][0].where).not.toHaveProperty('status');
  });

  it('narrows to flags raised by students, and is for admins only', async () => {
    const { GET } = await import('./route');
    mockPrisma.questionFlag.count.mockResolvedValue(0);
    mockPrisma.questionFlag.findMany.mockResolvedValue([]);
    mockPrisma.questionFlag.groupBy.mockResolvedValue([]);
    await GET(new Request('http://localhost/api/admin/question-flags?raisedBy=student'));
    expect(mockPrisma.questionFlag.findMany.mock.calls[0][0].where).toMatchObject({ flaggedBy: { role: 'STUDENT' } });
    const { getServerSession } = await import('next-auth');
    vi.mocked(getServerSession).mockResolvedValue({ user: { id: 't1', role: 'TEACHER' } } as never);
    expect((await GET(new Request('http://localhost/api/admin/question-flags'))).status).toBe(401);
  });
});

describe('POST /api/admin/question-flags', () => {
  it('raises a pending flag without touching the question', async () => {
    const { POST } = await import('./route');
    mockPrisma.question.findUnique.mockResolvedValue({ id: 'q-1' });
    mockPrisma.questionFlag.findFirst.mockResolvedValue(null);
    mockPrisma.questionFlag.create.mockResolvedValue({ id: 'f-1' });
    const res = await POST(post({ questionId: 'q-1', reason: 'Solution maths does not display' }));
    expect(res.status).toBe(201);
    expect(mockPrisma.questionFlag.create).toHaveBeenCalledWith({ data: { questionId: 'q-1', flaggedById: 'admin-1', reason: 'Solution maths does not display' } });
    expect(mockPrisma.question.update).not.toHaveBeenCalled();
    expect(recordAuditLog).toHaveBeenCalledWith(expect.objectContaining({ action: 'QUESTION_FLAGGED', entityId: 'q-1' }));
  });

  it('refuses a second pending flag on the same question', async () => {
    const { POST } = await import('./route');
    mockPrisma.question.findUnique.mockResolvedValue({ id: 'q-1' });
    mockPrisma.questionFlag.findFirst.mockResolvedValue({ id: 'f-0' });
    const res = await POST(post({ questionId: 'q-1', reason: 'again' }));
    expect(res.status).toBe(409);
    expect(mockPrisma.questionFlag.create).not.toHaveBeenCalled();
  });

  it('is for admins only and needs a reason', async () => {
    const { POST } = await import('./route');
    expect((await POST(post({ questionId: 'q-1' }))).status).toBe(400);
    const { getServerSession } = await import('next-auth');
    vi.mocked(getServerSession).mockResolvedValue({ user: { id: 's-1', role: 'STUDENT' } } as never);
    expect((await POST(post({ questionId: 'q-1', reason: 'x' }))).status).toBe(401);
  });
});

describe('PATCH /api/admin/question-flags/[id]', () => {
  it("returns a student's flagged question to approved and notifies the student", async () => {
    const { PATCH } = await import('./[id]/route');
    mockPrisma.questionFlag.findUnique.mockResolvedValue({ id: 'f-1', questionId: 'q-1', flaggedById: 's-1', status: 'PENDING', flaggedBy: { role: 'STUDENT' } });
    const res = await PATCH(patch({ action: 'CORRECTED', questionUpdate: { explanation: 'fixed' } }), { params });
    expect(res.status).toBe(200);
    expect(mockPrisma.question.update).toHaveBeenCalledWith({ where: { id: 'q-1' }, data: { status: 'APPROVED', explanation: 'fixed' } });
    expect(mockPrisma.notification.create).toHaveBeenCalled();
  });

  it("saves the correction to an admin-raised flag's question without approving it or notifying anyone", async () => {
    const { PATCH } = await import('./[id]/route');
    mockPrisma.questionFlag.findUnique.mockResolvedValue({ id: 'f-1', questionId: 'q-1', flaggedById: 'admin-1', status: 'PENDING', flaggedBy: { role: 'ADMIN' } });
    const res = await PATCH(patch({ action: 'CORRECTED', questionUpdate: { explanation: 'fixed' } }), { params });
    expect(res.status).toBe(200);
    expect(mockPrisma.question.update).toHaveBeenCalledWith({ where: { id: 'q-1' }, data: { explanation: 'fixed' } });
    expect(mockPrisma.notification.create).not.toHaveBeenCalled();
  });

  it('leaves the question untouched when an admin-raised flag is rejected', async () => {
    const { PATCH } = await import('./[id]/route');
    mockPrisma.questionFlag.findUnique.mockResolvedValue({ id: 'f-1', questionId: 'q-1', flaggedById: 'admin-1', status: 'PENDING', flaggedBy: { role: 'ADMIN' } });
    await PATCH(patch({ action: 'REJECTED' }), { params });
    expect(mockPrisma.question.update).not.toHaveBeenCalled();
    expect(mockPrisma.notification.create).not.toHaveBeenCalled();
  });
});
