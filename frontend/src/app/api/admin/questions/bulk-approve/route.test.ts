import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('next-auth', () => ({ getServerSession: vi.fn() }));
vi.mock('@/lib/auth', () => ({ authOptions: {} }));

const mockPrisma = {
  question: { create: vi.fn() },
  questionTag: { create: vi.fn() },
  pageFigure: { findMany: vi.fn() },
  $transaction: vi.fn(),
};
vi.mock('@/lib/prisma', () => ({ default: mockPrisma }));

function post(body: unknown) {
  return new Request('http://localhost/api/admin/questions/bulk-approve', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

// Structurally valid MCQ options (4 distinct choices, answer "A" resolves to
// the first) — the gate tests below vary provenance, not structural QA, so
// every question needs to already clear question-qa.ts's error bar.
const validOptions = [{ text: '2' }, { text: '3' }, { text: '4' }, { text: '5' }];

describe('POST /api/admin/questions/bulk-approve', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    const { getServerSession } = await import('next-auth');
    vi.mocked(getServerSession).mockResolvedValue({
      user: { id: 'admin-1', role: 'ADMIN' },
    } as any);
    mockPrisma.$transaction.mockImplementation((fn: any) => fn(mockPrisma));
    mockPrisma.question.create.mockImplementation(({ data }: any) => Promise.resolve({ id: `q-${data.content?.slice(0, 4) || 'x'}`, ...data }));
    mockPrisma.pageFigure.findMany.mockResolvedValue([]);
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
      questions: [{ question: 'Solve x', correctOption: 'A', options: validOptions, bookId: 'book-1' }],
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
      questions: [{ question: 'Solve x', correctOption: 'A', options: validOptions, bookId: 'book-1', sourcePageStart: 10, sourcePageEnd: 10, printedNumber: '3' }],
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
      questions: [{ question: 'A free-standing question', correctOption: 'A', options: validOptions }],
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
      questions: [{ question: 'Loosely based on chapter 4', correctOption: 'A', options: validOptions, bookId: 'book-1', provenance: 'MANUALLY_AUTHORED' }],
    }) as any);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(mockPrisma.question.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: 'APPROVED', provenance: 'MANUALLY_AUTHORED' }),
    }));
    expect(data.downgraded).toEqual([]);
  });

  describe('structural QA gate', () => {
    it('downgrades a question with duplicate options to PENDING_REVIEW instead of approving it', async () => {
      const { POST } = await import('./route');
      const response = await POST(post({
        questions: [{ question: 'What is 2 + 2?', correctOption: 'A', options: [{ text: '4' }, { text: '4' }, { text: '5' }, { text: '6' }] }],
      }) as any);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(mockPrisma.question.create).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({ status: 'PENDING_REVIEW' }),
      }));
      expect(data.downgraded).toEqual([{ index: 0, reason: expect.stringContaining('DUPLICATE_OPTIONS') }]);
    });

    it('downgrades a question whose answer letter points past the last option', async () => {
      const { POST } = await import('./route');
      const response = await POST(post({
        questions: [{ question: 'What is 2 + 2?', correctOption: 'E', options: validOptions }],
      }) as any);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(mockPrisma.question.create).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({ status: 'PENDING_REVIEW' }),
      }));
      expect(data.downgraded).toEqual([{ index: 0, reason: expect.stringContaining('BAD_ANSWER_OPTION') }]);
    });

    it('downgrades a question with fewer than 2 options', async () => {
      const { POST } = await import('./route');
      const response = await POST(post({
        questions: [{ question: 'What is 2 + 2?', correctOption: 'A', options: [{ text: '4' }] }],
      }) as any);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.downgraded).toEqual([{ index: 0, reason: expect.stringContaining('MISSING_OPTIONS') }]);
    });

    it('never runs the structural gate for a question already requesting PENDING_REVIEW', async () => {
      const { POST } = await import('./route');
      const response = await POST(post({
        questions: [{ question: 'What is 2 + 2?', correctOption: 'E', options: validOptions, status: 'PENDING_REVIEW' }],
      }) as any);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.downgraded).toEqual([]);
      expect(mockPrisma.question.create).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({ status: 'PENDING_REVIEW' }),
      }));
    });
  });

  describe('figure gate', () => {
    it('downgrades a figure-referencing, book-linked question with no retained figure asset', async () => {
      const { POST } = await import('./route');
      const response = await POST(post({
        questions: [{
          question: 'Study the diagram below and find x.', correctOption: 'A', options: validOptions,
          bookId: 'book-1', sourcePageStart: 10, sourcePageEnd: 10, printedNumber: '3',
        }],
      }) as any);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(mockPrisma.question.create).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({ status: 'PENDING_REVIEW' }),
      }));
      expect(data.downgraded).toEqual([{ index: 0, reason: expect.stringContaining('figure asset') }]);
    });

    it('approves a figure-referencing question once its linked figure has completed review', async () => {
      mockPrisma.pageFigure.findMany.mockImplementation(({ where }: any) =>
        Promise.resolve(where.questionId ? [{ id: 'f-1', reviewedAt: new Date(), matchedAutomatically: false }] : []));
      const { POST } = await import('./route');
      const response = await POST(post({
        questions: [{
          question: 'Study the diagram below and find x.', correctOption: 'A', options: validOptions,
          bookId: 'book-1', sourcePageStart: 10, sourcePageEnd: 10, printedNumber: '3',
        }],
      }) as any);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.downgraded).toEqual([]);
    });

    it('downgrades approval when an unresolved figure sits on the question\'s source page, even without figure-referencing text', async () => {
      mockPrisma.pageFigure.findMany.mockImplementation(({ where }: any) =>
        Promise.resolve(where.questionId === null ? [{ id: 'f-2', pageNumber: 10 }] : []));
      const { POST } = await import('./route');
      const response = await POST(post({
        questions: [{
          question: 'Solve for x in the equation.', correctOption: 'A', options: validOptions,
          bookId: 'book-1', sourcePageStart: 10, sourcePageEnd: 10, printedNumber: '3',
        }],
      }) as any);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.downgraded).toEqual([{ index: 0, reason: expect.stringContaining('unmatched figure') }]);
    });
  });
});
