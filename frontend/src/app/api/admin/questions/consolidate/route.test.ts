import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/auth-server', () => ({ getAuthenticatedUser: vi.fn() }));
const recordAuditLog = vi.fn();
vi.mock('@/lib/audit-log', () => ({ recordAuditLog, requestAuditContext: () => ({}) }));

const mockPrisma = {
  question: { findMany: vi.fn(), create: vi.fn(), update: vi.fn() },
  pageFigure: { findMany: vi.fn() },
  $transaction: vi.fn(),
};
vi.mock('@/lib/prisma', () => ({ default: mockPrisma }));

function post(body: unknown) {
  return new Request('http://localhost/api/admin/questions/consolidate', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

const baseBody = {
  bookId: 'book-1',
  content: 'A case study with two parts, consolidated.',
  options: ['2', '3', '4', '5'],
  correctAnswer: 'A',
  sourcePageStart: 10,
  sourcePageEnd: 11,
  printedNumber: '3',
  retireIds: ['q-1', 'q-2'],
  retireNote: 'Folded into the consolidated case study.',
};

describe('POST /api/admin/questions/consolidate', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    const { getAuthenticatedUser } = await import('@/lib/auth-server');
    vi.mocked(getAuthenticatedUser).mockResolvedValue({ user: { id: 'admin-1', role: 'ADMIN' } } as any);
    mockPrisma.question.findMany.mockResolvedValue([
      { id: 'q-1', bookId: 'book-1', status: 'DRAFT' },
      { id: 'q-2', bookId: 'book-1', status: 'DRAFT' },
    ]);
    mockPrisma.pageFigure.findMany.mockResolvedValue([]);
    // $transaction here is the array form (Prisma.PrismaPromise[]), not the
    // callback form -- resolve to whatever was passed in, id-tagged so the
    // [created, ...retired] destructure in the route works the same way.
    mockPrisma.$transaction.mockImplementation((ops: any[]) =>
      Promise.resolve(ops.map((op, i) => (i === 0 ? { id: 'q-new', ...op } : { id: `retired-${i}` }))));
  });

  it('downgrades a figure-referencing consolidation with no retained figure asset', async () => {
    const { POST } = await import('./route');
    const response = (await POST(post({ ...baseBody, content: 'Study the diagram below and find x.' }))) as Response;
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.downgradeReason).toContain('figure asset');
  });

  it('approves a figure-referencing consolidation once a figure has been linked and reviewed', async () => {
    mockPrisma.pageFigure.findMany.mockImplementation(({ where }: any) =>
      Promise.resolve(where.questionId === 'pending-consolidation' ? [{ id: 'f-1', reviewedAt: new Date(), matchedAutomatically: false }] : []));
    const { POST } = await import('./route');
    const response = (await POST(post({ ...baseBody, content: 'Study the diagram below and find x.' }))) as Response;
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.downgradeReason).toBeNull();
  });

  it('downgrades when an unresolved unmatched figure sits on the consolidated source page range', async () => {
    mockPrisma.pageFigure.findMany.mockImplementation(({ where }: any) =>
      Promise.resolve(where.questionId === null ? [{ id: 'f-2', pageNumber: 11 }] : []));
    const { POST } = await import('./route');
    const response = (await POST(post(baseBody))) as Response;
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.downgradeReason).toContain('unmatched figure');
  });

  it('approves a clean consolidation with no figure involvement', async () => {
    const { POST } = await import('./route');
    const response = (await POST(post(baseBody))) as Response;
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.downgradeReason).toBeNull();
  });
});
