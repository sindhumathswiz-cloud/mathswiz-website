import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('next-auth', () => ({ getServerSession: vi.fn() }));
vi.mock('@/lib/auth', () => ({ authOptions: {} }));

const recordAuditLog = vi.fn();
vi.mock('@/lib/audit-log', () => ({ recordAuditLog, requestAuditContext: () => ({}) }));

const mockPrisma = { question: { findUnique: vi.fn(), update: vi.fn() } };
vi.mock('@/lib/prisma', () => ({ default: mockPrisma }));

function post(body: unknown) {
  return new Request('http://localhost/api/admin/questions/review', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

// Structurally valid MCQ content -- the provenance-gate tests below vary
// provenance, not structural QA, so this fixture needs to already clear
// question-qa.ts's error bar.
const bookSourcedPending = {
  id: 'q-1', status: 'PENDING_REVIEW', reviewNotes: null,
  provenance: 'BOOK_SOURCED', bookId: 'book-1', sourcePageStart: 12, sourcePageEnd: 12, printedNumber: '5',
  content: 'What is 2 + 2?', options: ['2', '3', '4', '5'], correctAnswer: 'C', explanation: 'Basic addition.', type: 'SINGLE_CHOICE',
};

describe('POST /api/admin/questions/review', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    const { getServerSession } = await import('next-auth');
    vi.mocked(getServerSession).mockResolvedValue({ user: { id: 'admin-1', role: 'ADMIN' } } as any);
  });

  it('rejects non-admin callers', async () => {
    const { getServerSession } = await import('next-auth');
    vi.mocked(getServerSession).mockResolvedValue({ user: { id: 't-1', role: 'TEACHER' } } as any);
    const { POST } = await import('./route');
    const response = await POST(post({ questionId: 'q-1', action: 'APPROVE' }) as any);
    expect(response.status).toBe(401);
  });

  it('404s when the question does not exist', async () => {
    mockPrisma.question.findUnique.mockResolvedValue(null);
    const { POST } = await import('./route');
    const response = await POST(post({ questionId: 'q-1', action: 'APPROVE' }) as any);
    expect(response.status).toBe(404);
  });

  it('approves a BOOK_SOURCED question that has its source page and printed number', async () => {
    mockPrisma.question.findUnique.mockResolvedValue(bookSourcedPending);
    mockPrisma.question.update.mockResolvedValue({ ...bookSourcedPending, status: 'APPROVED' });
    const { POST } = await import('./route');
    const response = await POST(post({ questionId: 'q-1', action: 'APPROVE' }) as any);

    expect(response.status).toBe(200);
    expect(mockPrisma.question.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: 'APPROVED', scope: 'PUBLIC' }),
    }));
  });

  it('blocks approval of a BOOK_SOURCED question missing its printed number, without writing', async () => {
    mockPrisma.question.findUnique.mockResolvedValue({ ...bookSourcedPending, printedNumber: null });
    const { POST } = await import('./route');
    const response = await POST(post({ questionId: 'q-1', action: 'APPROVE' }) as any);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toContain('printedNumber');
    expect(mockPrisma.question.update).not.toHaveBeenCalled();
  });

  it('approves a MANUALLY_AUTHORED question with no source page at all', async () => {
    const manual = {
      id: 'q-2', status: 'PENDING_REVIEW', reviewNotes: null, provenance: 'MANUALLY_AUTHORED', bookId: null, sourcePageStart: null, sourcePageEnd: null, printedNumber: null,
      content: 'Prove that the square root of 2 is irrational.', options: null, correctAnswer: null, explanation: 'Proof by contradiction.', type: 'LONG_ANSWER',
    };
    mockPrisma.question.findUnique.mockResolvedValue(manual);
    mockPrisma.question.update.mockResolvedValue({ ...manual, status: 'APPROVED' });
    const { POST } = await import('./route');
    const response = await POST(post({ questionId: 'q-2', action: 'APPROVE' }) as any);

    expect(response.status).toBe(200);
    expect(mockPrisma.question.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: 'APPROVED' }),
    }));
  });

  it('blocks approval of a question with duplicate options, without writing', async () => {
    mockPrisma.question.findUnique.mockResolvedValue({ ...bookSourcedPending, options: ['4', '4', '5', '6'] });
    const { POST } = await import('./route');
    const response = await POST(post({ questionId: 'q-1', action: 'APPROVE' }) as any);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toContain('DUPLICATE_OPTIONS');
    expect(mockPrisma.question.update).not.toHaveBeenCalled();
  });

  it('blocks approval of a question whose answer letter points past the last option', async () => {
    mockPrisma.question.findUnique.mockResolvedValue({ ...bookSourcedPending, correctAnswer: 'E' });
    const { POST } = await import('./route');
    const response = await POST(post({ questionId: 'q-1', action: 'APPROVE' }) as any);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toContain('BAD_ANSWER_OPTION');
    expect(mockPrisma.question.update).not.toHaveBeenCalled();
  });

  it('rejecting a question never touches the provenance gate', async () => {
    mockPrisma.question.findUnique.mockResolvedValue({ ...bookSourcedPending, printedNumber: null });
    mockPrisma.question.update.mockResolvedValue({ ...bookSourcedPending, status: 'ARCHIVED' });
    const { POST } = await import('./route');
    const response = await POST(post({ questionId: 'q-1', action: 'REJECT' }) as any);

    expect(response.status).toBe(200);
    expect(mockPrisma.question.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: 'ARCHIVED' }),
    }));
  });
});
