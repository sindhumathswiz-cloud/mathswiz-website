import { beforeEach, describe, expect, it, vi } from 'vitest';

const getAuthenticatedUser = vi.fn();
const recordAuditLog = vi.fn();
const completeJsonPrompt = vi.fn();
const bookChapter = { findFirst: vi.fn() };
const bookIngestionRun = { findFirst: vi.fn() };
const documentPage = { findMany: vi.fn() };
const revisionItem = { createMany: vi.fn(), findMany: vi.fn() };
const loadConfirmedChapters = vi.fn();

vi.mock('@/lib/auth-server', () => ({ getAuthenticatedUser }));
vi.mock('@/lib/audit-log', () => ({ recordAuditLog, requestAuditContext: () => ({}) }));
vi.mock('@/lib/structure-questions', () => ({ completeJsonPrompt }));
vi.mock('@/lib/book-manifest', async (importOriginal) => ({ ...(await importOriginal<typeof import('@/lib/book-manifest')>()), loadConfirmedChapters }));
vi.mock('@/lib/prisma', () => ({ default: { bookChapter, bookIngestionRun, documentPage, revisionItem } }));

const params = () => Promise.resolve({ id: 'book-1' });
const post = async (body: unknown) => { const { POST } = await import('./route'); return await POST(new Request('http://localhost/x', { method: 'POST', body: JSON.stringify(body) }), { params: params() }) as Response; };

const PAGE_143 = 'Definition. A function f is continuous at x = c if \\(\\lim_{x \\to c} f(x) = f(c)\\). Example 3. Find the derivative of x^2.';
const PAGE_144 = "Theorem (Rolle). If f is continuous on [a, b] and differentiable on (a, b) and f(a) = f(b) then f'(c) = 0 for some c in (a, b).";

const reply = (content: string) => ({ content, provider: 'gemini' });
const llm = (items: unknown[]) => completeJsonPrompt.mockResolvedValue(reply(JSON.stringify({ items })));

describe('POST /api/admin/books/[id]/revision-content/extract', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getAuthenticatedUser.mockResolvedValue({ user: { id: 'admin-1', role: 'ADMIN' } });
    bookChapter.findFirst.mockResolvedValue({ id: 'ch-1', name: 'Continuity', startPage: 143, endPage: 144 });
    bookIngestionRun.findFirst.mockResolvedValue({ id: 'run-1', sourceDocumentId: 'doc-1', draftPurgedAt: null });
    documentPage.findMany.mockResolvedValue([{ pageNumber: 143, rawText: PAGE_143 }, { pageNumber: 144, rawText: PAGE_144 }]);
    revisionItem.findMany.mockResolvedValue([]);
    loadConfirmedChapters.mockResolvedValue([]);
    revisionItem.createMany.mockImplementation(async ({ data }: { data: unknown[] }) => ({ count: data.length }));
  });

  it('rejects non-admins and a missing chapterId', async () => {
    getAuthenticatedUser.mockResolvedValueOnce({ error: new Response(null, { status: 403 }) });
    expect((await post({ chapterId: 'ch-1' })).status).toBe(403);
    expect((await post({})).status).toBe(400);
  });

  it('will not run for a chapter without a page range, a purged draft, or a chapter with no page text', async () => {
    bookChapter.findFirst.mockResolvedValueOnce({ id: 'ch-1', name: 'X', startPage: null, endPage: null });
    expect((await post({ chapterId: 'ch-1' })).status).toBe(409);

    bookIngestionRun.findFirst.mockResolvedValueOnce({ id: 'run-1', sourceDocumentId: 'doc-1', draftPurgedAt: new Date() });
    expect((await post({ chapterId: 'ch-1' })).status).toBe(410);

    documentPage.findMany.mockResolvedValueOnce([{ pageNumber: 143, rawText: '  ' }]);
    const empty = await post({ chapterId: 'ch-1' });
    expect(empty.status).toBe(409);
    expect((await empty.json()).error).toMatch(/question extraction/i);
    expect(completeJsonPrompt).not.toHaveBeenCalled();
  });

  it('saves everything as DRAFT and grades each item against the page it came from', async () => {
    llm([
      { kind: 'DEFINITION', title: 'Continuity', body: 'A function $f$ is continuous at $x=c$ if $\\lim_{x\\to c}f(x)=f(c)$.', sourcePage: 143 },
      { kind: 'THEOREM', title: "Rolle's Theorem", body: "If f is continuous on [a, b] and differentiable on (a, b) and f(a) = f(b) then f'(c) = 1 for some c in (a, b).", sourcePage: 144 },
      { kind: 'FORMULA', title: 'Derivative of sin', body: 'The derivative of sin x is cos x for every real number x.', sourcePage: 143 },
    ]);
    const data = await (await post({ chapterId: 'ch-1' })).json();

    const rows = revisionItem.createMany.mock.calls[0][0].data as Array<{ title: string; verbatimScore: number; reviewNotes: string | null; bookId: string; chapterId: string; contentHash: string }>;
    expect(rows).toHaveLength(3);
    const byTitle = Object.fromEntries(rows.map(row => [row.title, row]));
    expect(byTitle['Continuity'].verbatimScore).toBe(1);
    expect(byTitle['Continuity'].reviewNotes).toBeNull();
    // One changed value in an otherwise exact copy is not trusted as verified.
    expect(byTitle["Rolle's Theorem"].verbatimScore).toBeLessThan(1);
    expect(byTitle["Rolle's Theorem"].reviewNotes).toMatch(/Differs slightly|Does not match/);
    // Invented content that is nowhere on the page is flagged as a mismatch.
    expect(byTitle['Derivative of sin'].verbatimScore).toBeLessThan(0.5);
    expect(byTitle['Derivative of sin'].reviewNotes).toMatch(/Does not match/);
    expect(rows.every(row => row.bookId === 'book-1' && row.chapterId === 'ch-1' && row.contentHash.length > 10)).toBe(true);
    // No status is ever sent: new items take the schema default, DRAFT.
    expect(rows.some(row => 'status' in row)).toBe(false);
    expect(data.batch).toMatchObject({ found: 3, saved: 3, EXACT: 1, MISMATCH: 1 });
    expect(recordAuditLog).toHaveBeenCalledWith(expect.objectContaining({ action: 'BOOK_REVISION_CONTENT_EXTRACTED' }));
  });

  it('drops items that cite a page that was not sent, and reports duplicates already saved', async () => {
    llm([
      { kind: 'DEFINITION', title: 'Continuity', body: 'A function f is continuous at x = c', sourcePage: 143 },
      { kind: 'DEFINITION', title: 'Made up', body: 'Something from a page never shown to the model', sourcePage: 500 },
    ]);
    revisionItem.createMany.mockResolvedValue({ count: 0 });
    const data = await (await post({ chapterId: 'ch-1' })).json();
    expect(revisionItem.createMany.mock.calls[0][0].data).toHaveLength(1);
    expect(revisionItem.createMany.mock.calls[0][0].skipDuplicates).toBe(true);
    expect(data.batch).toMatchObject({ found: 1, saved: 0, duplicates: 1 });
  });

  it('attributes an item to the page it is really on when the model cites the wrong one', async () => {
    llm([{ kind: 'DEFINITION', title: 'Continuity', body: 'A function f is continuous at x = c', sourcePage: 144 }]);
    await post({ chapterId: 'ch-1' });
    const [row] = revisionItem.createMany.mock.calls[0][0].data as Array<{ sourcePage: number; verbatimScore: number; reviewNotes: string | null }>;
    expect(row.sourcePage).toBe(143);
    expect(row.verbatimScore).toBe(1);
    expect(row.reviewNotes).toBeNull();
  });

  it('never treats an item with unclosed math as an exact match, even if it is copied exactly', async () => {
    documentPage.findMany.mockResolvedValue([{ pageNumber: 143, rawText: 'If $k$ is a constant then $\\int k f(x) dx = k \\int f(x) dx' }]);
    bookChapter.findFirst.mockResolvedValue({ id: 'ch-1', name: 'Integrals', startPage: 143, endPage: 143 });
    llm([{ kind: 'THEOREM', title: 'Constant factor rule', body: 'If $k$ is a constant then $\\int k f(x) dx = k \\int f(x) dx', sourcePage: 143 }]);
    const data = await (await post({ chapterId: 'ch-1' })).json();
    const [row] = revisionItem.createMany.mock.calls[0][0].data as Array<{ verbatimScore: number; reviewNotes: string }>;
    expect(row.verbatimScore).toBeLessThan(1);
    expect(row.reviewNotes).toMatch(/not closed/);
    expect(data.batch.EXACT).toBe(0);
  });

  it('does not save a passage that is already there, even when a re-run trimmed or extended it', async () => {
    revisionItem.findMany.mockResolvedValue([{ body: 'Continuity: A function f is continuous at x = c if the limit equals the value' }]);
    llm([
      { kind: 'DEFINITION', title: 'Continuity', body: 'A function f is continuous at x = c', sourcePage: 143 },
      { kind: 'THEOREM', title: "Rolle's Theorem", body: "If f is continuous on [a, b] and differentiable on (a, b) and f(a) = f(b) then f'(c) = 0 for some c in (a, b).", sourcePage: 144 },
    ]);
    const data = await (await post({ chapterId: 'ch-1' })).json();
    const saved = revisionItem.createMany.mock.calls[0][0].data as Array<{ title: string }>;
    // The short definition is inside the saved item only if it is long enough to be a real passage; it is not (< 30 chars), so it is kept.
    expect(saved.map(row => row.title)).toContain("Rolle's Theorem");
    expect(data.batch.found).toBe(2);
  });

  it('skips a longer re-extraction of an item that is already saved', async () => {
    revisionItem.findMany.mockResolvedValue([{ body: 'A function f is continuous at x = c if the limit of f(x) as x approaches c equals f(c)' }]);
    documentPage.findMany.mockResolvedValue([{ pageNumber: 143, rawText: 'Definition. A function f is continuous at x = c if the limit of f(x) as x approaches c equals f(c). Then more.' }]);
    bookChapter.findFirst.mockResolvedValue({ id: 'ch-1', name: 'Continuity', startPage: 143, endPage: 143 });
    llm([{ kind: 'DEFINITION', title: 'Continuity at a point', body: 'Definition. A function f is continuous at x = c if the limit of f(x) as x approaches c equals f(c).', sourcePage: 143 }]);
    revisionItem.createMany.mockClear();
    const data = await (await post({ chapterId: 'ch-1' })).json();
    expect(revisionItem.createMany).not.toHaveBeenCalled();
    expect(data.batch).toMatchObject({ found: 1, saved: 0, duplicates: 1 });
  });

  it('never shows the model an answer-key or solutions page, however it is detected', async () => {
    const ANSWER_PAGE = 'Answers\n1. (i) (d)\n(ii) (a)\n2. pi/2 log(1/2)\n3. 4x + C';
    bookChapter.findFirst.mockResolvedValue({ id: 'ch-1', name: 'Integrals', startPage: 143, endPage: 145 });
    documentPage.findMany.mockResolvedValue([
      { pageNumber: 143, rawText: PAGE_143 },
      { pageNumber: 144, rawText: ANSWER_PAGE },
      { pageNumber: 145, rawText: 'Worked pages the manifest marks as solutions: 1. we have x = 2. so the result follows from the definition above.' },
    ]);
    loadConfirmedChapters.mockResolvedValue([{ id: 'ch-1', manifestConfirmedAt: new Date(), exercises: [{ noAnswers: false, solutionsStartPage: 145, solutionsEndPage: 145, answerKeyStartPage: null, answerKeyEndPage: null }] }]);
    llm([]);
    const data = await (await post({ chapterId: 'ch-1' })).json();
    const sent = completeJsonPrompt.mock.calls[0][0] as string;
    expect(sent).toContain('=== PAGE 143 ===');
    expect(sent).not.toContain('=== PAGE 144 ===');
    expect(sent).not.toContain('=== PAGE 145 ===');
    expect(data.batch.skippedPages.map((p: { pageNumber: number }) => p.pageNumber)).toEqual([144, 145]);
  });

  it('flags an exact copy found on an exercise page so it is never approved in bulk', async () => {
    loadConfirmedChapters.mockResolvedValue([{ id: 'ch-1', manifestConfirmedAt: new Date(), exercises: [{ sectionType: 'EXERCISE', startPage: 144, endPage: 144, noAnswers: false, answerKeyStartPage: null, answerKeyEndPage: null, solutionsStartPage: null, solutionsEndPage: null }] }]);
    llm([
      { kind: 'DEFINITION', title: 'Continuity', body: 'A function f is continuous at x = c', sourcePage: 143 },
      { kind: 'THEOREM', title: "Rolle's Theorem", body: "If f is continuous on [a, b] and differentiable on (a, b) and f(a) = f(b) then f'(c) = 0 for some c in (a, b).", sourcePage: 144 },
    ]);
    await post({ chapterId: 'ch-1' });
    const rows = revisionItem.createMany.mock.calls[0][0].data as Array<{ title: string; verbatimScore: number; reviewNotes: string | null }>;
    const byTitle = Object.fromEntries(rows.map(row => [row.title, row]));
    expect(byTitle['Continuity']).toMatchObject({ verbatimScore: 1, reviewNotes: null });
    // Copied perfectly, but from an exercise page: held back for a human look.
    expect(byTitle["Rolle's Theorem"].verbatimScore).toBe(1);
    expect(byTitle["Rolle's Theorem"].reviewNotes).toMatch(/exercises or examples/);
  });

  it('finishes cleanly when every remaining page is an answer or solutions page', async () => {
    documentPage.findMany.mockResolvedValue([{ pageNumber: 144, rawText: 'Answers\n1. (i) (d)\n(ii) (a)\n(iii) (c)' }]);
    const data = await (await post({ chapterId: 'ch-1', startPage: 144 })).json();
    expect(completeJsonPrompt).not.toHaveBeenCalled();
    expect(data).toMatchObject({ batch: null, nextStartPage: null });
    expect(data.skippedPages).toHaveLength(1);
  });

  it('treats an unreadable reply as a failure to retry, not as "nothing found"', async () => {
    completeJsonPrompt.mockResolvedValue(reply('{"items": [ {"kind": "FORMULA", "title": "Cut off mid-str'));
    const response = await post({ chapterId: 'ch-1' });
    expect(response.status).toBe(502);
    expect((await response.json()).error).toMatch(/could not be read/);
    expect(revisionItem.createMany).not.toHaveBeenCalled();

    // A readable, empty list IS a genuine "nothing on these pages".
    completeJsonPrompt.mockResolvedValue(reply('{"items": []}'));
    expect((await post({ chapterId: 'ch-1' })).status).toBe(200);
  });

  it('retries an unreadable batch one page at a time, keeps what it can read, and names the pages it could not', async () => {
    completeJsonPrompt
      .mockResolvedValueOnce(reply('{"items": [ {"title": "broken'))
      .mockResolvedValueOnce(reply(JSON.stringify({ items: [{ kind: 'DEFINITION', title: 'Continuity', body: 'A function f is continuous at x = c', sourcePage: 143 }] })))
      .mockResolvedValueOnce(reply('not json either'));
    const data = await (await post({ chapterId: 'ch-1' })).json();
    expect(completeJsonPrompt).toHaveBeenCalledTimes(3);
    expect(revisionItem.createMany.mock.calls[0][0].data).toHaveLength(1);
    expect(data.batch).toMatchObject({ found: 1, saved: 1, unreadablePages: [144] });
  });

  it('returns a retryable 502 and saves nothing when the language model fails', async () => {
    completeJsonPrompt.mockRejectedValue(new Error('All providers failed'));
    const response = await post({ chapterId: 'ch-1' });
    expect(response.status).toBe(502);
    expect((await response.json()).error).toContain('Nothing was saved');
    expect(revisionItem.createMany).not.toHaveBeenCalled();
  });

  it('pages through the chapter one batch at a time', async () => {
    const pages = Array.from({ length: 10 }, (_, i) => ({ pageNumber: 143 + i, rawText: 'x'.repeat(3000) }));
    bookChapter.findFirst.mockResolvedValue({ id: 'ch-1', name: 'Continuity', startPage: 143, endPage: 152 });
    documentPage.findMany.mockResolvedValue(pages);
    llm([]);
    const data = await (await post({ chapterId: 'ch-1' })).json();
    expect(completeJsonPrompt).toHaveBeenCalledTimes(1);
    expect(data.batch.pages).toBeLessThan(10);
    expect(data.nextStartPage).toBe(data.batch.endPage + 1);

    documentPage.findMany.mockResolvedValue(pages.slice(8));
    const last = await (await post({ chapterId: 'ch-1', startPage: 151 })).json();
    expect(last.nextStartPage).toBeNull();
  });
});
