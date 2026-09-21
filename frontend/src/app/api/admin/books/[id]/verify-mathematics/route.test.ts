import { beforeEach, describe, expect, it, vi } from 'vitest';

const getAuthenticatedUser = vi.fn();
const recordAuditLog = vi.fn();
const fetchFromLLM = vi.fn();

const book = { findUnique: vi.fn() };
const question = { findMany: vi.fn(), update: vi.fn() };
const pageFigure = { findMany: vi.fn() };

vi.mock('@/lib/auth-server', () => ({ getAuthenticatedUser }));
vi.mock('@/lib/prisma', () => ({ default: { book, question, pageFigure } }));
vi.mock('@/lib/audit-log', () => ({ recordAuditLog, requestAuditContext: () => ({}) }));
vi.mock('@/lib/llm', () => ({ fetchFromLLM }));

function post(body: unknown) {
  return new Request('http://localhost/api/admin/books/book-1/verify-mathematics', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

const params = Promise.resolve({ id: 'book-1' });

const baseQuestion = {
  id: 'q-1', content: 'What is 2 + 2?', options: null, correctAnswer: '4', explanation: null,
  type: 'SUBJECTIVE', tags: [] as string[], reviewNotes: null, status: 'DRAFT',
  // Every real candidate here is bookId-scoped by the query itself, so it's
  // BOOK_SOURCED with a full source page + printed number by default -- the
  // "missing provenance" gate test below overrides these to prove the block.
  provenance: 'BOOK_SOURCED', bookId: 'book-1', sourcePageStart: 42, sourcePageEnd: 42, printedNumber: '7',
};

describe('POST /api/admin/books/[id]/verify-mathematics', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getAuthenticatedUser.mockResolvedValue({ user: { id: 'admin-1', role: 'ADMIN' } });
    book.findUnique.mockResolvedValue({ id: 'book-1' });
    // No linked/unresolved figures by default -- baseQuestion's plain "What
    // is 2 + 2?" content doesn't reference a figure either, so the gate
    // passes cleanly unless a test deliberately overrides this.
    pageFigure.findMany.mockResolvedValue([]);
  });

  it('rejects non-admin callers', async () => {
    getAuthenticatedUser.mockResolvedValue({ error: new Response(null, { status: 403 }) });
    const { POST } = await import('./route');
    const response = (await POST(post({}), { params })) as Response;
    expect(response.status).toBe(403);
  });

  it('404s when the book is not found', async () => {
    book.findUnique.mockResolvedValue(null);
    const { POST } = await import('./route');
    const response = (await POST(post({}), { params })) as Response;
    expect(response.status).toBe(404);
  });

  it('selects only STRUCTURALLY_VALID DRAFT/REPORTED candidates not already AI-verified', async () => {
    question.findMany.mockResolvedValue([]);
    const { POST } = await import('./route');
    await POST(post({}), { params });

    expect(question.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        bookId: 'book-1',
        status: { in: ['DRAFT', 'REPORTED'] },
        verificationStatus: 'STRUCTURALLY_VALID',
        NOT: { tags: { hasSome: ['AI-Verified: Confirmed', 'AI-Verified: Flagged'] } },
      }),
    }));
  });

  it('reports a dry-run verified verdict without writing', async () => {
    question.findMany.mockResolvedValue([baseQuestion]);
    fetchFromLLM.mockResolvedValue('{"verdict":"verified"}');

    const { POST } = await import('./route');
    const response = (await POST(post({ limit: 5 }), { params })) as Response;
    const data = await response.json();

    expect(data.apply).toBe(false);
    expect(data.candidatesProcessed).toBe(1);
    expect(data.verified).toBe(1);
    expect(data.flagged).toBe(0);
    expect(data.errored).toBe(0);
    expect(data.details).toContainEqual(expect.objectContaining({ questionId: 'q-1', outcome: 'would_verify' }));
    expect(question.update).not.toHaveBeenCalled();
  });

  it('applies a verified verdict: auto-approves the row (status -> APPROVED), sets MATHEMATICALLY_VERIFIED, and tags it', async () => {
    question.findMany.mockResolvedValue([{ ...baseQuestion, status: 'REPORTED' }]);
    fetchFromLLM.mockResolvedValue('{"verdict":"verified"}');

    const { POST } = await import('./route');
    await POST(post({ apply: true }), { params });

    expect(question.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'q-1' },
      data: expect.objectContaining({
        status: 'APPROVED',
        verificationStatus: 'MATHEMATICALLY_VERIFIED',
        tags: ['AI-Verified: Confirmed'],
      }),
    }));
    expect(recordAuditLog).toHaveBeenCalledWith(expect.objectContaining({ action: 'BOOK_MATHEMATICS_VERIFIED' }));
  });

  it('applies a verified verdict but withholds approval when the question is missing its printed number: still records MATHEMATICALLY_VERIFIED, never touches status', async () => {
    question.findMany.mockResolvedValue([{ ...baseQuestion, status: 'REPORTED', printedNumber: null }]);
    fetchFromLLM.mockResolvedValue('{"verdict":"verified"}');

    const { POST } = await import('./route');
    const response = (await POST(post({ apply: true }), { params })) as Response;
    const data = await response.json();

    expect(data.details).toContainEqual(expect.objectContaining({ questionId: 'q-1', outcome: 'verified_pending_provenance' }));
    expect(question.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'q-1' },
      data: expect.objectContaining({
        verificationStatus: 'MATHEMATICALLY_VERIFIED',
        reviewNotes: expect.stringContaining('printedNumber'),
      }),
    }));
    // The acceptance gate: verified math is not enough on its own -- a
    // BOOK_SOURCED question missing its printed number must not reach
    // APPROVED, even on a confirmed verdict.
    const call = question.update.mock.calls[0][0];
    expect(call.data).not.toHaveProperty('status');
  });

  it('applies a verified verdict but withholds approval when a figure-referencing question has no retained figure asset', async () => {
    question.findMany.mockResolvedValue([{ ...baseQuestion, status: 'REPORTED', content: 'Study the diagram below and find x.' }]);
    fetchFromLLM.mockResolvedValue('{"verdict":"verified"}');
    pageFigure.findMany.mockResolvedValue([]); // no linked figure, nothing unresolved on the page

    const { POST } = await import('./route');
    await POST(post({ apply: true }), { params });

    expect(question.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'q-1' },
      data: expect.objectContaining({
        verificationStatus: 'MATHEMATICALLY_VERIFIED',
        reviewNotes: expect.stringContaining('figure asset'),
      }),
    }));
    const call = question.update.mock.calls[0][0];
    expect(call.data).not.toHaveProperty('status');
  });

  it('applies a verified verdict but withholds approval when the linked figure has not completed visual review', async () => {
    question.findMany.mockResolvedValue([{ ...baseQuestion, status: 'REPORTED' }]);
    fetchFromLLM.mockResolvedValue('{"verdict":"verified"}');
    pageFigure.findMany.mockImplementation(({ where }: any) =>
      Promise.resolve(where.questionId === 'q-1' ? [{ id: 'f-1', reviewedAt: null, matchedAutomatically: true }] : []));

    const { POST } = await import('./route');
    await POST(post({ apply: true }), { params });

    const call = question.update.mock.calls[0][0];
    expect(call.data.reviewNotes).toContain('visual review');
    expect(call.data).not.toHaveProperty('status');
  });

  it('applies an issue verdict: sets NEEDS_REVIEW, flags the row, and records category/evidence in reviewNotes', async () => {
    question.findMany.mockResolvedValue([baseQuestion]);
    fetchFromLLM.mockResolvedValue('```json\n{"verdict":"issue","category":"insufficient_information","evidence":"Missing figure reference."}\n```');

    const { POST } = await import('./route');
    const response = (await POST(post({ apply: true }), { params })) as Response;
    const data = await response.json();

    expect(data.flagged).toBe(1);
    expect(data.details).toContainEqual(expect.objectContaining({ questionId: 'q-1', outcome: 'flagged', category: 'insufficient_information' }));
    expect(question.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'q-1' },
      data: expect.objectContaining({
        verificationStatus: 'NEEDS_REVIEW',
        tags: ['AI-Verified: Flagged'],
        reviewNotes: expect.stringContaining('Missing figure reference.'),
      }),
    }));
    // An "issue" verdict must never touch status -- no auto-approval path
    // for anything the independent re-derivation didn't confirm.
    const call = question.update.mock.calls[0][0];
    expect(call.data).not.toHaveProperty('status');
  });

  it('is tolerant of an LLM error or malformed response: counts it and leaves the question untouched for retry, without aborting the batch', async () => {
    question.findMany.mockResolvedValue([baseQuestion, { ...baseQuestion, id: 'q-2' }]);
    fetchFromLLM.mockRejectedValueOnce(new Error('provider down'));
    fetchFromLLM.mockResolvedValueOnce('{"verdict":"verified"}');

    const { POST } = await import('./route');
    const response = (await POST(post({ apply: true }), { params })) as Response;
    const data = await response.json();

    expect(data.errored).toBe(1);
    expect(data.verified).toBe(1);
    expect(data.details).toContainEqual(expect.objectContaining({ questionId: 'q-1', outcome: 'llm_error_will_retry' }));
    expect(question.update).toHaveBeenCalledTimes(1);
    expect(question.update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'q-2' } }));
  });

  it('clamps limit to MAX_LIMIT and defaults it when absent or invalid', async () => {
    question.findMany.mockResolvedValue([]);
    const { POST } = await import('./route');

    const overLimit = await (await POST(post({ limit: 500 }), { params }) as Response).json();
    expect(overLimit.limit).toBe(50);

    const defaultLimit = await (await POST(post({}), { params }) as Response).json();
    expect(defaultLimit.limit).toBe(20);
  });
});
