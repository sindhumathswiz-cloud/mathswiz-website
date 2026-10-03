import { beforeEach, describe, expect, it, vi } from 'vitest';

const getAuthenticatedUser = vi.fn();
const recordAuditLog = vi.fn();
const bookIngestionRun = { findFirst: vi.fn() };
const documentPage = { findMany: vi.fn(), findUnique: vi.fn(), update: vi.fn() };
const pageExtractionBenchmark = { findMany: vi.fn() };

vi.mock('@/lib/auth-server', () => ({ getAuthenticatedUser }));
vi.mock('@/lib/audit-log', () => ({ recordAuditLog, requestAuditContext: () => ({}) }));
vi.mock('@/lib/prisma', () => ({ default: { bookIngestionRun, documentPage, pageExtractionBenchmark } }));

const params = () => Promise.resolve({ id: 'book-1', runId: 'run-1' });
const post = (body: unknown) => new Request('http://localhost/x', { method: 'POST', body: JSON.stringify(body) });
const callPost = async (body: unknown) => { const { POST } = await import('./route'); return await POST(post(body), { params: params() }) as Response; };

const geminiBenchmark = { provider: 'GEMINI_VISION', rawOutput: {}, structuredData: { questions: [{ contentMmd: '1. Evaluate the integral.\n$$\\int x^2 dx$$', options: [] }] } };
const mathpixBenchmark = (formula: string) => ({ provider: 'MATHPIX_OCR', structuredData: null, rawOutput: { line_data: [
  { type: 'text', text: '1. Evaluate the integral.' }, { type: 'math', text: formula },
] } });
const mathpixMarkdown = (formula: string) => `1. Evaluate the integral.\n\n$$\n${formula}\n$$\n`;

const page = (overrides: Record<string, unknown> = {}) => ({
  id: 'page-1', pageNumber: 4, layoutData: { pageType: 'QUESTION' }, ocrProvider: null, rawMarkdown: '',
  benchmarks: [geminiBenchmark, mathpixBenchmark('\\( \\int x^{2} d x \\)')], ...overrides,
});

describe('/api/admin/books/[id]/ingestions/[runId]/reconcile', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getAuthenticatedUser.mockResolvedValue({ user: { id: 'admin-1', role: 'ADMIN' } });
    bookIngestionRun.findFirst.mockResolvedValue({ id: 'run-1', sourceDocumentId: 'doc-1', totalPages: 10, book: { title: 'Calculus' } });
    documentPage.update.mockResolvedValue({});
  });

  it('rejects non-admins and bad page numbers', async () => {
    getAuthenticatedUser.mockResolvedValueOnce({ error: new Response(null, { status: 403 }) });
    expect((await callPost({})).status).toBe(403);
    expect((await callPost({ pageNumber: 0 })).status).toBe(400);
  });

  it('compares the Mathpix OCR text the extraction already stored with a Gemini benchmark, with no Mathpix benchmark', async () => {
    documentPage.findMany.mockResolvedValue([page({ ocrProvider: 'MATHPIX_OCR', rawMarkdown: mathpixMarkdown('\\int x^{3} d x'), benchmarks: [geminiBenchmark] })]);
    const response = await callPost({ pageNumber: 4 });
    expect(response.status).toBe(200);
    const saved = documentPage.update.mock.calls[0][0].data.layoutData.reconciliation;
    expect(saved.status).toBe('HAS_HOLDS');
    expect(saved.pairing).toEqual({ primary: 'MATHPIX_OCR', primaryOrigin: 'EXTRACTION', secondary: 'GEMINI_VISION' });
  });

  it('uses the Mathpix benchmark when one exists and reports it as the origin', async () => {
    documentPage.findMany.mockResolvedValue([page()]);
    await callPost({});
    const saved = documentPage.update.mock.calls[0][0].data.layoutData.reconciliation;
    expect(saved.status).toBe('CLEAN');
    expect(saved.pairing.primaryOrigin).toBe('BENCHMARK');
    expect(saved.pageType ?? documentPage.update.mock.calls[0][0].data.layoutData.pageType).toBe('QUESTION');
  });

  it('skips a page that only has one provider reading and says so, without writing anything', async () => {
    documentPage.findMany.mockResolvedValue([page({ benchmarks: [geminiBenchmark] })]);
    const body = await (await callPost({})).json();
    expect(body).toMatchObject({ reconciled: 0, skippedSingleReading: 1 });
    expect(documentPage.update).not.toHaveBeenCalled();
  });

  it('409s for a single requested page that has no Gemini reading, explaining that no provider was called', async () => {
    documentPage.findMany.mockResolvedValue([]);
    const response = await callPost({ pageNumber: 4 });
    expect(response.status).toBe(409);
    expect((await response.json()).error).toContain('No provider was called');
  });

  it('keeps a human review when a re-run finds the same disputes, and drops it when they change', async () => {
    const disputed = page({ ocrProvider: 'MATHPIX_OCR', rawMarkdown: mathpixMarkdown('\\int x^{3} d x'), benchmarks: [geminiBenchmark] });
    documentPage.findMany.mockResolvedValue([disputed]);
    await callPost({ pageNumber: 4 });
    const first = documentPage.update.mock.calls[0][0].data.layoutData.reconciliation;

    documentPage.findMany.mockResolvedValue([{ ...disputed, layoutData: { reconciliation: { ...first, status: 'REVIEWED', resolution: { reviewedBy: 'admin-1', note: 'ok' } } } }]);
    await callPost({ pageNumber: 4 });
    const kept = documentPage.update.mock.calls[1][0].data.layoutData.reconciliation;
    expect(kept.status).toBe('REVIEWED');
    expect(kept.resolution.note).toBe('ok');

    documentPage.findMany.mockResolvedValue([{ ...disputed, rawMarkdown: mathpixMarkdown('\\int x^{4} d x'), layoutData: { reconciliation: { ...first, status: 'REVIEWED', resolution: { note: 'ok' } } } }]);
    await callPost({ pageNumber: 4 });
    expect(documentPage.update.mock.calls[2][0].data.layoutData.reconciliation.status).toBe('HAS_HOLDS');
  });

  it('MARK_REVIEWED and REOPEN only apply in the right state and are audited', async () => {
    documentPage.findUnique.mockResolvedValue({ id: 'page-1', layoutData: { reconciliation: { status: 'CLEAN' } } });
    expect((await callPost({ pageNumber: 4, action: 'MARK_REVIEWED' })).status).toBe(409);

    documentPage.findUnique.mockResolvedValue({ id: 'page-1', layoutData: { keep: 1, reconciliation: { status: 'HAS_HOLDS' } } });
    const reviewed = await callPost({ pageNumber: 4, action: 'MARK_REVIEWED', note: 'checked against the page' });
    expect(reviewed.status).toBe(200);
    const saved = documentPage.update.mock.calls[0][0].data.layoutData;
    expect(saved.keep).toBe(1);
    expect(saved.reconciliation).toMatchObject({ status: 'REVIEWED', resolution: { reviewedBy: 'admin-1', note: 'checked against the page' } });
    expect(recordAuditLog).toHaveBeenCalledWith(expect.objectContaining({ action: 'BOOK_PAGE_DISPUTES_REVIEWED' }));

    documentPage.findUnique.mockResolvedValue({ id: 'page-1', layoutData: { reconciliation: { status: 'REVIEWED', resolution: {} } } });
    expect((await callPost({ pageNumber: 4, action: 'REOPEN' })).status).toBe(200);
    expect(documentPage.update.mock.calls[1][0].data.layoutData.reconciliation).toMatchObject({ status: 'HAS_HOLDS', resolution: null });
  });

  it('GET reports what readings exist and lists pages needing attention', async () => {
    documentPage.findMany
      .mockResolvedValueOnce([
        { id: 'p1', ocrProvider: 'MATHPIX_OCR' }, { id: 'p2', ocrProvider: 'MATHPIX_OCR' }, { id: 'p3', ocrProvider: null },
        { id: 'p4', ocrProvider: null }, { id: 'p5', ocrProvider: 'NATIVE_TEXT' },
      ])
      .mockResolvedValueOnce([
        { pageNumber: 4, layoutData: { reconciliation: { status: 'HAS_HOLDS', heldBlocks: 2, agreementBlocks: 5, heldPrintedNumbers: ['1', '3'], heldBlockDetails: [{ blockIndex: 1 }] } } },
        { pageNumber: 5, layoutData: { reconciliation: { status: 'CLEAN', heldBlocks: 0, agreementBlocks: 4 } } },
        { pageNumber: 6, layoutData: { reconciliation: { status: 'REVIEWED', heldBlocks: 1, agreementBlocks: 2, resolution: { note: 'ok' } } } },
      ]);
    pageExtractionBenchmark.findMany.mockResolvedValue([
      { documentPageId: 'p1', provider: 'GEMINI_VISION' }, { documentPageId: 'p3', provider: 'GEMINI_VISION' }, { documentPageId: 'p4', provider: 'MATHPIX_OCR' },
    ]);
    const { GET } = await import('./route');
    const body = await (await GET(new Request('http://localhost/x'), { params: params() }) as Response).json();
    expect(body.coverage).toEqual({ totalPages: 10, ready: 1, mathpixOnly: 2, geminiOnly: 1, noReading: 1 });
    expect(body.summary).toMatchObject({ reconciledPages: 3, clean: 1, hasHolds: 1, reviewed: 1, heldBlocks: 2, agreementBlocks: 11 });
    expect(body.pages.map((p: { pageNumber: number }) => p.pageNumber)).toEqual([4, 6]);
  });
});
