import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('next-auth', () => ({ getServerSession: vi.fn() }));
vi.mock('@/lib/auth', () => ({ authOptions: {} }));

const recordAuditLog = vi.fn();
vi.mock('@/lib/audit-log', () => ({ recordAuditLog, requestAuditContext: () => ({}) }));

const mockPrisma = {
  question: { findUnique: vi.fn(), update: vi.fn(), delete: vi.fn() },
  questionTag: { deleteMany: vi.fn(), create: vi.fn(), findMany: vi.fn() },
  tagTaxonomy: { findMany: vi.fn() },
};
vi.mock('@/lib/prisma', () => ({ default: mockPrisma }));

function patch(body: unknown) {
  return new Request('http://localhost/api/questions/q-1', {
    method: 'PATCH',
    body: JSON.stringify(body),
  });
}

const params = (id = 'q-1') => Promise.resolve({ id });

const bookSourced = {
  createdById: 'admin-1', scope: 'PUBLIC',
  provenance: 'BOOK_SOURCED', bookId: 'book-1', sourcePageStart: 8, sourcePageEnd: 8, printedNumber: '2',
};

describe('PATCH /api/questions/[id] -- provenance acceptance gate', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    const { getServerSession } = await import('next-auth');
    vi.mocked(getServerSession).mockResolvedValue({ user: { id: 'admin-1', role: 'ADMIN' } } as any);
    mockPrisma.questionTag.findMany.mockResolvedValue([]);
  });

  it('approves a BOOK_SOURCED question that has its source page and printed number', async () => {
    mockPrisma.question.findUnique.mockResolvedValue(bookSourced);
    mockPrisma.question.update.mockResolvedValue({ id: 'q-1', status: 'APPROVED' });
    const { PATCH } = await import('./route');
    const response = await PATCH(patch({ status: 'APPROVED' }) as any, { params: params() });

    expect(response.status).toBe(200);
    expect(mockPrisma.question.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: 'APPROVED' }) }));
  });

  it('blocks approval of a BOOK_SOURCED question with no printed number, without writing', async () => {
    mockPrisma.question.findUnique.mockResolvedValue({ ...bookSourced, printedNumber: null });
    const { PATCH } = await import('./route');
    const response = await PATCH(patch({ status: 'APPROVED' }) as any, { params: params() });
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toContain('printedNumber');
    expect(mockPrisma.question.update).not.toHaveBeenCalled();
  });

  it('blocks approval of a question with no book link and no provenance override (defaults to BOOK_SOURCED-shaped check failing)', async () => {
    mockPrisma.question.findUnique.mockResolvedValue({ createdById: 'admin-1', scope: 'PUBLIC', provenance: 'BOOK_SOURCED', bookId: null, sourcePageStart: null, sourcePageEnd: null, printedNumber: null });
    const { PATCH } = await import('./route');
    const response = await PATCH(patch({ status: 'APPROVED' }) as any, { params: params() });
    expect(response.status).toBe(400);
  });

  it('approves that same question once the request also marks it MANUALLY_AUTHORED', async () => {
    mockPrisma.question.findUnique.mockResolvedValue({ createdById: 'admin-1', scope: 'PUBLIC', provenance: 'BOOK_SOURCED', bookId: null, sourcePageStart: null, sourcePageEnd: null, printedNumber: null });
    mockPrisma.question.update.mockResolvedValue({ id: 'q-1', status: 'APPROVED' });
    const { PATCH } = await import('./route');
    const response = await PATCH(patch({ status: 'APPROVED', provenance: 'MANUALLY_AUTHORED' }) as any, { params: params() });

    expect(response.status).toBe(200);
    expect(mockPrisma.question.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: 'APPROVED', provenance: 'MANUALLY_AUTHORED' }),
    }));
  });

  it('does not run the gate for a non-approval update', async () => {
    mockPrisma.question.findUnique.mockResolvedValue({ ...bookSourced, printedNumber: null });
    mockPrisma.question.update.mockResolvedValue({ id: 'q-1', reviewNotes: 'looks off' });
    const { PATCH } = await import('./route');
    const response = await PATCH(patch({ reviewNotes: 'looks off' }) as any, { params: params() });

    expect(response.status).toBe(200);
    expect(mockPrisma.question.update).toHaveBeenCalled();
  });
});
