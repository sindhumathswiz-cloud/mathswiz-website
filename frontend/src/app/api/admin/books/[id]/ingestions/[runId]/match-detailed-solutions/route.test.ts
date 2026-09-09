import { beforeEach, describe, expect, it, vi } from 'vitest';

const getAuthenticatedUser = vi.fn();
const recordAuditLog = vi.fn();
const findOrCreateBookChapter = vi.fn();

const bookIngestionRun = { findFirst: vi.fn() };
const documentPage = { findMany: vi.fn() };
const question = { findMany: vi.fn(), update: vi.fn() };

vi.mock('@/lib/auth-server', () => ({ getAuthenticatedUser }));
vi.mock('@/lib/prisma', () => ({ default: { bookIngestionRun, documentPage, question } }));
vi.mock('@/lib/audit-log', () => ({ recordAuditLog, requestAuditContext: () => ({}) }));
vi.mock('../extract-questions/route', () => ({ findOrCreateBookChapter }));

function post(body: unknown) {
  return new Request('http://localhost/api/admin/books/book-1/ingestions/run-1/match-detailed-solutions', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

const params = Promise.resolve({ id: 'book-1', runId: 'run-1' });

// A realistic "Solutions" section: an explicit heading (confirmed against
// real pages from Sindhu's book -- see below), then several substantial
// numbered worked-solution paragraphs (long enough to clear
// MIN_AVG_BLOCK_CHARS), newline-separated for these baseline tests.
const SOLUTION_TEXT = (n: number) =>
  `${n}. We are given the function and must differentiate both sides with respect to $x$, then simplify using the chain rule and standard identities. Hence the required value is obtained after simplification.\n`;

function solutionsPage(nums: number[]): string {
  return `Solutions\n\n${nums.map(SOLUTION_TEXT).join('\n')}`;
}

describe('POST /api/admin/books/[id]/ingestions/[runId]/match-detailed-solutions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getAuthenticatedUser.mockResolvedValue({ user: { id: 'admin-1', role: 'ADMIN' } });
    bookIngestionRun.findFirst.mockResolvedValue({ id: 'run-1', sourceDocumentId: 'doc-1' });
    findOrCreateBookChapter.mockResolvedValue('chapter-1');
  });

  it('rejects non-admin callers', async () => {
    getAuthenticatedUser.mockResolvedValue({ error: new Response(null, { status: 403 }) });
    const { POST } = await import('./route');
    const response = (await POST(post({}), { params })) as Response;
    expect(response.status).toBe(403);
  });

  it('404s when the ingestion run is not found', async () => {
    bookIngestionRun.findFirst.mockResolvedValue(null);
    const { POST } = await import('./route');
    const response = (await POST(post({}), { params })) as Response;
    expect(response.status).toBe(404);
  });

  it('ignores a page with numbered blocks but no solutions heading', async () => {
    documentPage.findMany.mockResolvedValue([
      { pageNumber: 30, rawText: '1. Find the derivative of $x^2$.\n2. Solve for $x$ in $x+1=3$.' },
    ]);
    const { POST } = await import('./route');
    const response = (await POST(post({}), { params })) as Response;
    const data = await response.json();
    expect(data.solutionsPagesFound).toBe(0);
    expect(question.findMany).not.toHaveBeenCalled();
  });

  it('ignores a page with a heading but only short, question-like numbered blocks', async () => {
    documentPage.findMany.mockResolvedValue([
      { pageNumber: 30, rawText: 'Solutions\n\n1. Short.\n2. Also short.' },
    ]);
    const { POST } = await import('./route');
    const response = (await POST(post({}), { params })) as Response;
    const data = await response.json();
    expect(data.solutionsPagesFound).toBe(0);
  });

  it('ignores a page where "solution" appears mid-sentence a few lines down, not as the page\'s own first line', async () => {
    // Modeled directly on a real false-positive candidate from the book: a
    // normal question page whose stem happens to contain the word
    // "solution" -- must NOT be mistaken for a solutions section just
    // because the word appears somewhere on the page.
    documentPage.findMany.mockResolvedValue([
      { pageNumber: 303, rawText: '10. Show that the general solution of the differential equation is given by a suitable family of curves satisfying the stated initial condition.\n11. Find the particular solution given that $y=1$ when $x=0$.' },
    ]);
    const { POST } = await import('./route');
    const response = (await POST(post({}), { params })) as Response;
    const data = await response.json();
    expect(data.solutionsPagesFound).toBe(0);
  });

  it('recognizes the real heading format "Solutions of Selected Multiple Choice Questions"', async () => {
    documentPage.findMany.mockResolvedValue([
      { pageNumber: 30, rawText: `Solutions of Selected Multiple Choice Questions\n\n${SOLUTION_TEXT(1)}\n${SOLUTION_TEXT(2)}` },
    ]);
    question.findMany.mockResolvedValue([]);
    const { POST } = await import('./route');
    const response = (await POST(post({}), { params })) as Response;
    const data = await response.json();
    expect(data.solutionsPagesFound).toBe(1);
  });

  it('parses each solution as its own block even when the OCR joins "$N." straight onto the previous block\'s closing "$" with no newline (the actual pattern in Sindhu\'s book), and keeps each block\'s own LaTeX intact', async () => {
    // Modeled directly on real page 79/107 text: Mathpix frequently emits
    // "...=A^{2}=I$2. We have,$..." with NO line break, and NO other
    // separator, between one solution's closing "$" and the very next
    // solution's leading number. A parser that only looks for a preceding
    // "\n" would silently merge solutions 1, 2 and 3 into a single
    // oversized block 1, and blocks 2/3 would never be found (or matched)
    // at all.
    const block1 = 'We have,$A^{2}=A\\times A$ which simplifies to the identity matrix, so the final result is$I$';
    const block2 = 'We have,$B^{2}=I$ which follows from the given relation applied twice, giving the value$k$';
    const block3 = 'We have,$C=AB$ which is obtained by direct substitution of the known values into the formula above.';
    const rawText = `Solutions of Selected Multiple Choice Questions\n1. ${block1}2. ${block2}3. ${block3}`;
    documentPage.findMany.mockResolvedValue([{ pageNumber: 30, rawText }]);
    question.findMany.mockImplementation(async ({ where }: any) => {
      if (['1', '2', '3'].includes(where.printedNumber)) {
        return [{ id: `q-${where.printedNumber}`, explanation: null, tags: ['Questions without Solutions'], topic: '', reviewNotes: null }];
      }
      return [];
    });

    const { POST } = await import('./route');
    const response = (await POST(post({ apply: true }), { params })) as Response;
    const data = await response.json();

    expect(data.blocksFound).toBe(3);
    expect(data.matched).toBe(3);
    // Each block keeps exactly its own text, with its own closing "$"
    // (LaTeX intact) -- block 1 must NOT swallow block 2's "We have,$B..."
    // text, and vice versa.
    expect(question.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'q-1' },
      data: expect.objectContaining({ explanation: block1 }),
    }));
    expect(question.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'q-2' },
      data: expect.objectContaining({ explanation: block2 }),
    }));
    expect(question.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'q-3' },
      data: expect.objectContaining({ explanation: block3 }),
    }));
  });

  it('detects a genuine detailed-solutions page and reports a dry-run match without writing', async () => {
    documentPage.findMany.mockResolvedValue([{ pageNumber: 30, rawText: solutionsPage([1, 2, 3, 4]) }]);
    question.findMany.mockImplementation(async ({ where }: any) => {
      if (where.printedNumber === '1') return [{ id: 'q-1', explanation: null, tags: ['Questions without Solutions'], topic: 'Integrals', reviewNotes: null }];
      if (where.printedNumber === '2') return [{ id: 'q-2', explanation: null, tags: ['Questions without Solutions'], topic: 'Integrals', reviewNotes: null }];
      return [];
    });

    const { POST } = await import('./route');
    const response = (await POST(post({}), { params })) as Response;
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.apply).toBe(false);
    expect(data.solutionsPagesFound).toBe(1);
    expect(data.blocksFound).toBe(4);
    expect(data.lowCoveragePagesSkipped).toBe(0); // 2 of 4 = coverage 0.5, passes
    expect(data.matched).toBe(2);
    expect(data.updated).toBe(0);
    expect(question.update).not.toHaveBeenCalled();
    expect(data.details).toContainEqual(expect.objectContaining({ printedNumber: '1', questionId: 'q-1', outcome: 'would_update' }));
  });

  it('writes explanation, strips the no-solution tags, and audits only when apply:true', async () => {
    documentPage.findMany.mockResolvedValue([{ pageNumber: 30, rawText: solutionsPage([1, 2, 3, 4]) }]);
    question.findMany.mockImplementation(async ({ where }: any) => {
      if (where.printedNumber === '1') return [{ id: 'q-1', explanation: null, tags: ['Questions without Solutions', 'Hint Available'], topic: 'Integrals', reviewNotes: null }];
      if (where.printedNumber === '2') return [{ id: 'q-2', explanation: null, tags: ['Questions without Solutions'], topic: 'Integrals', reviewNotes: 'existing note' }];
      return [];
    });

    const { POST } = await import('./route');
    await POST(post({ apply: true }), { params });

    expect(question.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'q-1' },
      data: expect.objectContaining({
        explanation: expect.stringContaining('differentiate both sides'),
        tags: [],
      }),
    }));
    expect(question.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'q-2' },
      data: expect.objectContaining({ reviewNotes: expect.stringContaining('existing note') }),
    }));
    // printedNumber is never touched by this route.
    expect(question.update).not.toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ printedNumber: expect.anything() }),
    }));
    expect(recordAuditLog).toHaveBeenCalledWith(expect.objectContaining({ action: 'BOOK_DETAILED_SOLUTIONS_MATCHED' }));
  });

  it('never overwrites a question that already has a full solution (not tagged, non-empty explanation)', async () => {
    documentPage.findMany.mockResolvedValue([{ pageNumber: 30, rawText: solutionsPage([1, 2, 3, 4]) }]);
    question.findMany.mockImplementation(async ({ where }: any) => {
      if (where.printedNumber === '1') return [{ id: 'q-1', explanation: 'Already has a full worked solution.', tags: [], topic: 'Integrals', reviewNotes: null }];
      if (where.printedNumber === '2') return [{ id: 'q-2', explanation: null, tags: ['Questions without Solutions'], topic: 'Integrals', reviewNotes: null }];
      return [];
    });

    const { POST } = await import('./route');
    const response = (await POST(post({}), { params })) as Response;
    const data = await response.json();

    expect(data.alreadyHasSolution).toBe(1);
    expect(data.matched).toBe(1);
    expect(data.details).toContainEqual(expect.objectContaining({ printedNumber: '1', outcome: 'already_has_solution' }));
  });

  it('skips as ambiguous when more than one eligible DRAFT candidate shares the printed number', async () => {
    documentPage.findMany.mockResolvedValue([{ pageNumber: 30, rawText: solutionsPage([1, 2, 3, 4]) }]);
    question.findMany.mockImplementation(async ({ where }: any) => {
      if (where.printedNumber === '1') {
        return [
          { id: 'q-1a', explanation: null, tags: ['Questions without Solutions'], topic: '', reviewNotes: null },
          { id: 'q-1b', explanation: null, tags: ['Questions without Solutions'], topic: '', reviewNotes: null },
        ];
      }
      if (where.printedNumber === '2') return [{ id: 'q-2', explanation: null, tags: ['Questions without Solutions'], topic: '', reviewNotes: null }];
      return [];
    });

    const { POST } = await import('./route');
    const response = (await POST(post({}), { params })) as Response;
    const data = await response.json();

    expect(data.ambiguous).toBe(1);
    expect(question.update).not.toHaveBeenCalled();
  });

  it('skips an entire page as low-coverage when too few of its numbers correspond to any nearby DRAFT candidate', async () => {
    documentPage.findMany.mockResolvedValue([{ pageNumber: 30, rawText: solutionsPage([1, 2, 3, 4]) }]);
    question.findMany.mockImplementation(async ({ where }: any) => {
      if (where.printedNumber === '1') return [{ id: 'q-1', explanation: null, tags: ['Questions without Solutions'], topic: '', reviewNotes: null }];
      return [];
    });

    const { POST } = await import('./route');
    const response = (await POST(post({}), { params })) as Response;
    const data = await response.json();

    expect(data.lowCoveragePagesSkipped).toBe(1);
    expect(data.matched).toBe(0);
    expect(question.update).not.toHaveBeenCalled();
    expect(data.details).toContainEqual(expect.objectContaining({ outcome: 'low_coverage_page_1_of_4' }));
  });

  it('backfills an empty topic from a clear majority among same-page matches, and links the BookChapter', async () => {
    documentPage.findMany.mockResolvedValue([{ pageNumber: 30, rawText: solutionsPage([1, 2, 3, 4]) }]);
    question.findMany.mockImplementation(async ({ where }: any) => {
      if (where.printedNumber === '1') return [{ id: 'q-1', explanation: null, tags: ['Questions without Solutions'], topic: 'Integrals', reviewNotes: null }];
      if (where.printedNumber === '2') return [{ id: 'q-2', explanation: null, tags: ['Questions without Solutions'], topic: 'Integrals', reviewNotes: null }];
      if (where.printedNumber === '3') return [{ id: 'q-3', explanation: null, tags: ['Questions without Solutions'], topic: '', reviewNotes: null }];
      return [];
    });

    const { POST } = await import('./route');
    const response = (await POST(post({ apply: true }), { params })) as Response;
    const data = await response.json();

    expect(data.topicsBackfilled).toBe(1);
    expect(findOrCreateBookChapter).toHaveBeenCalledWith('book-1', 'Integrals', expect.any(Map));
    expect(question.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'q-3' },
      data: expect.objectContaining({ topic: 'Integrals', bookChapterId: 'chapter-1' }),
    }));
    // q-1 and q-2 already had a topic -- must not be touched by the backfill.
    expect(question.update).not.toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'q-1' },
      data: expect.objectContaining({ bookChapterId: expect.anything() }),
    }));
  });

  it('does not backfill topic when same-page matches disagree (no clear majority)', async () => {
    documentPage.findMany.mockResolvedValue([{ pageNumber: 30, rawText: solutionsPage([1, 2, 3, 4]) }]);
    question.findMany.mockImplementation(async ({ where }: any) => {
      if (where.printedNumber === '1') return [{ id: 'q-1', explanation: null, tags: ['Questions without Solutions'], topic: 'Integrals', reviewNotes: null }];
      if (where.printedNumber === '2') return [{ id: 'q-2', explanation: null, tags: ['Questions without Solutions'], topic: 'Matrices', reviewNotes: null }];
      if (where.printedNumber === '3') return [{ id: 'q-3', explanation: null, tags: ['Questions without Solutions'], topic: '', reviewNotes: null }];
      return [];
    });

    const { POST } = await import('./route');
    const response = (await POST(post({}), { params })) as Response;
    const data = await response.json();

    expect(data.topicsBackfilled).toBe(0);
  });
});
