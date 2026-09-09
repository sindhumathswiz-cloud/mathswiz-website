import { beforeEach, describe, expect, it, vi } from 'vitest';

const getAuthenticatedUser = vi.fn();
const recordAuditLog = vi.fn();

const bookIngestionRun = { findFirst: vi.fn() };
const documentPage = { findMany: vi.fn() };
const question = { findMany: vi.fn(), update: vi.fn() };

vi.mock('@/lib/auth-server', () => ({ getAuthenticatedUser }));
vi.mock('@/lib/prisma', () => ({ default: { bookIngestionRun, documentPage, question } }));
vi.mock('@/lib/audit-log', () => ({ recordAuditLog, requestAuditContext: () => ({}) }));

function post(body: unknown) {
  return new Request('http://localhost/api/admin/books/book-1/ingestions/run-1/match-answer-keys', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

const params = Promise.resolve({ id: 'book-1', runId: 'run-1' });

describe('POST /api/admin/books/[id]/ingestions/[runId]/match-answer-keys', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getAuthenticatedUser.mockResolvedValue({ user: { id: 'admin-1', role: 'ADMIN' } });
    bookIngestionRun.findFirst.mockResolvedValue({ id: 'run-1', sourceDocumentId: 'doc-1' });
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

  it('ignores a page that has too few number/letter pairs and no answer-key heading', async () => {
    documentPage.findMany.mockResolvedValue([
      { pageNumber: 10, rawText: 'A regular question page. 1. (a) is not an answer key by itself.' },
    ]);
    const { POST } = await import('./route');
    const response = (await POST(post({}), { params })) as Response;
    const data = await response.json();
    expect(data.answerKeyPagesFound).toBe(0);
    expect(question.findMany).not.toHaveBeenCalled();
  });

  it('detects a dense answer-key page and reports a dry-run match without writing', async () => {
    documentPage.findMany.mockResolvedValue([
      { pageNumber: 20, rawText: 'Answers\n1. (b) 2. (a) 3. (c) 4. (d) 5. (a) 6. (b) 7. (c) 8. (d)' },
    ]);
    // Numbers 1-4 have SOME nearby DRAFT candidate (coverage 4/8 = 0.5, at
    // the pass threshold); 2-4 are deliberately ambiguous (two candidates
    // each) so only number 1 actually resolves to a single match.
    question.findMany.mockImplementation(async ({ where }: any) => {
      if (where.printedNumber === '1') return [{ id: 'q-1', options: ['a', 'b', 'c', 'd'], sourcePageStart: 18, reviewNotes: null }];
      if (['2', '3', '4'].includes(where.printedNumber)) {
        return [
          { id: `${where.printedNumber}-a`, options: ['a', 'b'], sourcePageStart: 18, reviewNotes: null },
          { id: `${where.printedNumber}-b`, options: ['a', 'b'], sourcePageStart: 12, reviewNotes: null },
        ];
      }
      return [];
    });

    const { POST } = await import('./route');
    const response = (await POST(post({}), { params })) as Response;
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.apply).toBe(false);
    expect(data.answerKeyPagesFound).toBe(1);
    expect(data.pairsFound).toBe(8);
    expect(data.lowCoveragePagesSkipped).toBe(0);
    expect(data.matched).toBe(1);
    expect(data.ambiguous).toBe(3);
    expect(data.updated).toBe(0);
    expect(question.update).not.toHaveBeenCalled();
    expect(data.details).toContainEqual(expect.objectContaining({ printedNumber: '1', letter: 'B', questionId: 'q-1', outcome: 'would_update' }));
  });

  it('writes the matched answer and audits only when apply:true is passed, without touching printedNumber', async () => {
    documentPage.findMany.mockResolvedValue([
      { pageNumber: 20, rawText: 'Answers\n1. (b) 2. (a) 3. (c) 4. (d) 5. (a) 6. (b) 7. (c) 8. (d)' },
    ]);
    question.findMany.mockImplementation(async ({ where }: any) => {
      if (where.printedNumber === '1') return [{ id: 'q-1', options: ['a', 'b', 'c', 'd'], sourcePageStart: 18, reviewNotes: null }];
      if (['2', '3', '4'].includes(where.printedNumber)) {
        return [{ id: `${where.printedNumber}-a`, options: ['a', 'b'], sourcePageStart: 18, reviewNotes: null }];
      }
      return [];
    });

    const { POST } = await import('./route');
    await POST(post({ apply: true }), { params });

    expect(question.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'q-1' },
      data: expect.objectContaining({ correctAnswer: 'B' }),
    }));
    // printedNumber is left alone here -- a sibling pass (detailed-solution
    // matching) may still need it; clearing it is a separate, explicit step
    // (POST .../clear-printed-numbers) run once ALL matching passes are done.
    expect(question.update).not.toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ printedNumber: expect.anything() }),
    }));
    expect(recordAuditLog).toHaveBeenCalled();
  });

  it('skips a candidate with no options (not MCQ-shaped) as no_candidate, and does NOT let it count toward page coverage', async () => {
    documentPage.findMany.mockResolvedValue([
      { pageNumber: 20, rawText: 'Answers\n1. (b) 2. (a) 3. (c) 4. (d) 5. (a) 6. (b) 7. (c) 8. (d)' },
    ]);
    question.findMany.mockImplementation(async ({ where }: any) => {
      // Present but not MCQ-shaped -- does NOT count toward coverage (see
      // the cross-chapter-collision regression test below for why), and
      // can't receive an answer letter either way.
      if (where.printedNumber === '1') return [{ id: 'q-1', options: [], sourcePageStart: 18, reviewNotes: null }];
      if (['2', '3', '4', '5'].includes(where.printedNumber)) {
        return [{ id: `${where.printedNumber}-a`, options: ['a', 'b'], sourcePageStart: 18, reviewNotes: null }];
      }
      return [];
    });

    const { POST } = await import('./route');
    const response = (await POST(post({}), { params })) as Response;
    const data = await response.json();

    // Coverage here is the 4 MCQ-shaped hits (2-5) out of 8 pairs = 0.5,
    // exactly at the pass threshold -- the non-MCQ hit on 1 contributes
    // nothing toward it.
    expect(data.lowCoveragePagesSkipped).toBe(0);
    expect(data.matched).toBe(4);
    expect(data.noCandidate).toBeGreaterThanOrEqual(1);
    expect(data.details).toContainEqual(expect.objectContaining({ printedNumber: '1', outcome: 'no_candidate' }));
  });

  it('regression: does not let an unrelated chapter answer-key page pass coverage on non-MCQ candidates alone, protecting the real MCQs from being claimed with the wrong letters', async () => {
    // Modeled on a real cross-chapter collision found while running this
    // book chapter-by-chapter: pages 364-391 are chapter A (Three
    // Dimensional Geometry), and its own real MCQ answer key at page 370 got
    // skipped as low-coverage for unrelated reasons. Page 404 is chapter B's
    // (Linear Programming, not yet extracted) answer key -- printed numbers
    // 1-10 restart from 1, and its 40-page lookback window reaches back into
    // chapter A far enough to see chapter A's own scattered non-MCQ
    // (subjective/long-answer) DRAFT questions sharing those same small
    // numbers across various unrelated exercises. Before the fix, those
    // non-MCQ hits alone were enough to push page 404 over the coverage bar,
    // letting it claim chapter A's real MCQs (numbers 1-3, still unanswered)
    // with chapter B's letters -- silently wrong answers on live data.
    documentPage.findMany.mockResolvedValue([
      { pageNumber: 404, rawText: 'Answers\n1. (b) 2. (d) 3. (b) 4. (c) 5. (b) 6. (c) 7. (b) 8. (d) 9. (b) 10. (b)' },
    ]);
    question.findMany.mockImplementation(async ({ where }: any) => {
      // Numbers 1-3: real MCQ-shaped candidates belonging to chapter A,
      // still unanswered -- these are what must NOT be claimed here.
      if (['1', '2', '3'].includes(where.printedNumber)) {
        return [{ id: `chapterA-${where.printedNumber}`, options: ['a', 'b', 'c', 'd'], sourcePageStart: 367, reviewNotes: null }];
      }
      // Numbers 4-10: chapter A's own subjective/long-answer questions from
      // various unrelated exercises happen to reuse these small numbers too
      // -- present, but not MCQ-shaped, and not actually chapter B's.
      if (['4', '5', '6', '7', '8', '9', '10'].includes(where.printedNumber)) {
        return [{ id: `subjective-${where.printedNumber}`, options: [], sourcePageStart: 380, reviewNotes: null }];
      }
      return [];
    });

    const { POST } = await import('./route');
    const response = (await POST(post({}), { params })) as Response;
    const data = await response.json();

    // Real coverage (MCQ-shaped only) is 3/10 = 0.3, below the 0.5 bar --
    // the whole page must be skipped, not just the non-MCQ numbers.
    expect(data.lowCoveragePagesSkipped).toBe(1);
    expect(data.matched).toBe(0);
    expect(question.update).not.toHaveBeenCalled();
    expect(data.details).toContainEqual(expect.objectContaining({ outcome: 'low_coverage_page_3_of_10' }));
    // Chapter A's real MCQs must not appear as any kind of match here.
    expect(data.details).not.toContainEqual(expect.objectContaining({ questionId: 'chapterA-1' }));
    expect(data.details).not.toContainEqual(expect.objectContaining({ questionId: 'chapterA-2' }));
    expect(data.details).not.toContainEqual(expect.objectContaining({ questionId: 'chapterA-3' }));
  });

  it('skips as ambiguous when more than one DRAFT candidate shares the printed number in the lookback window, once page coverage is otherwise satisfied', async () => {
    documentPage.findMany.mockResolvedValue([
      { pageNumber: 20, rawText: 'Answers\n1. (b) 2. (a) 3. (c) 4. (d) 5. (a) 6. (b) 7. (c) 8. (d)' },
    ]);
    question.findMany.mockImplementation(async ({ where }: any) => {
      if (where.printedNumber === '1') {
        return [
          { id: 'q-1', options: ['a', 'b'], sourcePageStart: 18, reviewNotes: null },
          { id: 'q-2', options: ['a', 'b'], sourcePageStart: 12, reviewNotes: null },
        ];
      }
      if (['2', '3', '4', '5'].includes(where.printedNumber)) {
        return [{ id: `${where.printedNumber}-a`, options: ['a', 'b'], sourcePageStart: 18, reviewNotes: null }];
      }
      return [];
    });

    const { POST } = await import('./route');
    const response = (await POST(post({}), { params })) as Response;
    const data = await response.json();

    expect(data.lowCoveragePagesSkipped).toBe(0);
    expect(data.matched).toBe(4);
    expect(data.ambiguous).toBeGreaterThanOrEqual(1);
    expect(question.update).not.toHaveBeenCalled();
  });

  it('never overwrites a question that already has a correctAnswer (query excludes it)', async () => {
    documentPage.findMany.mockResolvedValue([
      { pageNumber: 20, rawText: 'Answers\n1. (b) 2. (a) 3. (c) 4. (d) 5. (a) 6. (b) 7. (c) 8. (d)' },
    ]);
    question.findMany.mockResolvedValue([]);

    const { POST } = await import('./route');
    await POST(post({ apply: true }), { params });

    expect(question.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        status: 'DRAFT',
        OR: [{ correctAnswer: null }, { correctAnswer: '' }],
      }),
    }));
    expect(question.update).not.toHaveBeenCalled();
  });

  it('skips an entire answer-key page as low-coverage when too few of its numbers correspond to any nearby DRAFT candidate', async () => {
    documentPage.findMany.mockResolvedValue([
      { pageNumber: 20, rawText: 'Answers\n1. (b) 2. (a) 3. (c) 4. (d) 5. (a) 6. (b) 7. (c) 8. (d)' },
    ]);
    // Only number 1 has any nearby candidate at all -- 1/8 = 0.125 coverage,
    // well under the 0.5 threshold, even though that one candidate would
    // otherwise have matched cleanly.
    question.findMany.mockImplementation(async ({ where }: any) => {
      if (where.printedNumber === '1') return [{ id: 'q-1', options: ['a', 'b', 'c', 'd'], sourcePageStart: 18, reviewNotes: null }];
      return [];
    });

    const { POST } = await import('./route');
    const response = (await POST(post({}), { params })) as Response;
    const data = await response.json();

    expect(data.lowCoveragePagesSkipped).toBe(1);
    expect(data.matched).toBe(0);
    expect(data.noCandidate).toBe(0);
    expect(question.update).not.toHaveBeenCalled();
    expect(data.details).toContainEqual(expect.objectContaining({ outcome: 'low_coverage_page_1_of_8' }));
  });
});
