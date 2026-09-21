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

// Structurally valid MCQ content -- these tests vary provenance, not
// structural QA, so the fixture needs to already clear question-qa.ts's
// error bar (see the separate 'structural QA gate' describe block below).
const bookSourced = {
  createdById: 'admin-1', scope: 'PUBLIC',
  provenance: 'BOOK_SOURCED', bookId: 'book-1', sourcePageStart: 8, sourcePageEnd: 8, printedNumber: '2',
  content: 'What is 2 + 2?', options: ['2', '3', '4', '5'], correctAnswer: 'C', explanation: 'Basic addition.', type: 'SINGLE_CHOICE',
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
    mockPrisma.question.findUnique.mockResolvedValue({ ...bookSourced, bookId: null, sourcePageStart: null, sourcePageEnd: null, printedNumber: null });
    const { PATCH } = await import('./route');
    const response = await PATCH(patch({ status: 'APPROVED' }) as any, { params: params() });
    expect(response.status).toBe(400);
  });

  it('approves that same question once the request also marks it MANUALLY_AUTHORED', async () => {
    mockPrisma.question.findUnique.mockResolvedValue({ ...bookSourced, bookId: null, sourcePageStart: null, sourcePageEnd: null, printedNumber: null });
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

describe('PATCH /api/questions/[id] -- structural QA gate', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    const { getServerSession } = await import('next-auth');
    vi.mocked(getServerSession).mockResolvedValue({ user: { id: 'admin-1', role: 'ADMIN' } } as any);
    mockPrisma.questionTag.findMany.mockResolvedValue([]);
  });

  it('blocks approval of a question with duplicate options, without writing', async () => {
    mockPrisma.question.findUnique.mockResolvedValue({ ...bookSourced, options: ['4', '4', '5', '6'] });
    const { PATCH } = await import('./route');
    const response = await PATCH(patch({ status: 'APPROVED' }) as any, { params: params() });
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toContain('DUPLICATE_OPTIONS');
    expect(mockPrisma.question.update).not.toHaveBeenCalled();
  });

  it('blocks approval of a question whose answer letter points past the last option', async () => {
    mockPrisma.question.findUnique.mockResolvedValue({ ...bookSourced, correctAnswer: 'E' });
    const { PATCH } = await import('./route');
    const response = await PATCH(patch({ status: 'APPROVED' }) as any, { params: params() });
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toContain('BAD_ANSWER_OPTION');
    expect(mockPrisma.question.update).not.toHaveBeenCalled();
  });

  it('approves once a PATCH that also fixes the bad options in the same request', async () => {
    mockPrisma.question.findUnique.mockResolvedValue({ ...bookSourced, options: ['4', '4', '5', '6'] });
    mockPrisma.question.update.mockResolvedValue({ id: 'q-1', status: 'APPROVED' });
    const { PATCH } = await import('./route');
    const response = await PATCH(patch({ status: 'APPROVED', options: ['2', '3', '4', '5'] }) as any, { params: params() });

    expect(response.status).toBe(200);
    expect(mockPrisma.question.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: 'APPROVED' }),
    }));
  });
});
