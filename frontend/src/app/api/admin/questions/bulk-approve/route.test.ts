import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('next-auth', () => ({ getServerSession: vi.fn() }));
vi.mock('@/lib/auth', () => ({ authOptions: {} }));

const mockPrisma = {
  question: { create: vi.fn() },
  questionTag: { create: vi.fn() },
  $transaction: vi.fn(),
};
vi.mock('@/lib/prisma', () => ({ default: mockPrisma }));

function post(body: unknown) {
  return new Request('http://localhost/api/admin/questions/bulk-approve', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

describe('POST /api/admin/questions/bulk-approve', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    const { getServerSession } = await import('next-auth');
    vi.mocked(getServerSession).mockResolvedValue({
      user: { id: 'admin-1', role: 'ADMIN' },
    } as any);
    mockPrisma.$transaction.mockImplementation((fn: any) => fn(mockPrisma));
    mockPrisma.question.create.mockImplementation(({ data }: any) => Promise.resolve({ id: `q-${data.content?.slice(0, 4) || 'x'}`, ...data }));
  });

  it('rejects unauthenticated callers', async () => {
    const { getServerSession } = await import('next-auth');
    vi.mocked(getServerSession).mockResolvedValue(null);
    const { POST } = await import('./route');
    const response = await POST(post({ questions: [{ question: 'x' }] }) as any);
    expect(response.status).toBe(401);
  });

  it('rejects an empty or missing questions array', async () => {
    const { POST } = await import('./route');
    const response = await POST(post({ questions: [] }) as any);
    expect(response.status).toBe(400);
  });

  it('downgrades a book-linked question with no printed number to PENDING_REVIEW instead of approving it', async () => {
    const { POST } = await import('./route');
    const response = await POST(post({
      questions: [{ question: 'Solve x', correctOption: 'A', bookId: 'book-1' }],
    }) as any);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(mockPrisma.question.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: 'PENDING_REVIEW', provenance: 'BOOK_SOURCED', bookId: 'book-1' }),
    }));
    expect(data.downgraded).toEqual([{ index: 0, reason: expect.stringContaining('printedNumber') }]);
  });

  it('approves a book-linked question that carries its full source page and printed number', async () => {
    const { POST } = await import('./route');
    const response = await POST(post({
      questions: [{ question: 'Solve x', correctOption: 'A', bookId: 'book-1', sourcePageStart: 10, sourcePageEnd: 10, printedNumber: '3' }],
    }) as any);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(mockPrisma.question.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: 'APPROVED', provenance: 'BOOK_SOURCED' }),
    }));
    expect(data.downgraded).toEqual([]);
  });

  it('approves a question with no book link as MANUALLY_AUTHORED, unaffected by the gate', async () => {
    const { POST } = await import('./route');
    const response = await POST(post({
      questions: [{ question: 'A free-standing question', correctOption: 'A' }],
    }) as any);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(mockPrisma.question.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: 'APPROVED', provenance: 'MANUALLY_AUTHORED', bookId: null }),
    }));
    expect(data.downgraded).toEqual([]);
  });

  it('honors an explicit MANUALLY_AUTHORED override on a question that does carry a bookId', async () => {
    const { POST } = await import('./route');
    const response = await POST(post({
      questions: [{ question: 'Loosely based on chapter 4', correctOption: 'A', bookId: 'book-1', provenance: 'MANUALLY_AUTHORED' }],
    }) as any);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(mockPrisma.question.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: 'APPROVED', provenance: 'MANUALLY_AUTHORED' }),
    }));
    expect(data.downgraded).toEqual([]);
  });
});
