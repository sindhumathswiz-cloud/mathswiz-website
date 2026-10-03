import { beforeEach, describe, expect, it, vi } from 'vitest';

const getAuthenticatedUser = vi.fn();
const recordAuditLog = vi.fn();
const buildNativeTextLayers = vi.fn();
const ocrPageWithMathpix = vi.fn();
const bookIngestionRun = { findFirst: vi.fn() };
const documentPage = { update: vi.fn() };
const queryRaw = vi.fn();

vi.mock('@/lib/auth-server', () => ({ getAuthenticatedUser }));
vi.mock('@/lib/audit-log', () => ({ recordAuditLog, requestAuditContext: () => ({}) }));
vi.mock('@/lib/prisma', () => ({ default: { bookIngestionRun, documentPage, $queryRaw: queryRaw } }));
vi.mock('@/lib/pdf-text-layer', () => ({ buildNativeTextLayers }));
vi.mock('@/lib/extract-book-page', () => ({ ocrPageWithMathpix }));

const params = () => Promise.resolve({ id: 'book-1', runId: 'run-1' });
const post = async (body: unknown) => { const { POST } = await import('./route'); return await POST(new Request('http://localhost/x', { method: 'POST', body: JSON.stringify(body) }), { params: params() }) as Response; };

const nativeLayer = { version: 1, source: 'NATIVE_PDF', garbled: 0, lines: [{ x: 0.1, y: 0.1, w: 0.5, h: 0.02, text: 'Hello world', kind: 'text' }] };
const ocrLayer = { version: 1, source: 'MATHPIX_OCR', lines: [{ x: 0.1, y: 0.2, w: 0.4, h: 0.02, text: '$x$', kind: 'math' }] };
const candidate = (pageNumber: number, overrides: Record<string, unknown> = {}) => ({
  id: `page-${pageNumber}`, pageNumber, missing: true, nativeChars: 0, pageImagePath: `books/b/r/pages/${pageNumber}.jpg`, processedImagePath: null, width: 1000, height: 1400, ...overrides,
});

describe('/api/admin/books/[id]/ingestions/[runId]/text-layers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getAuthenticatedUser.mockResolvedValue({ user: { id: 'admin-1', role: 'ADMIN' } });
    bookIngestionRun.findFirst.mockResolvedValue({ id: 'run-1', storagePath: 'books/b/r.pdf', sourceDocumentId: 'doc-1', totalPages: 10, draftPurgedAt: null });
    buildNativeTextLayers.mockResolvedValue(new Map());
    documentPage.update.mockResolvedValue({});
  });

  it('rejects non-admins', async () => {
    getAuthenticatedUser.mockResolvedValue({ error: new Response(null, { status: 403 }) });
    expect((await post({})).status).toBe(403);
  });

  it('refuses a draft whose pages were already purged', async () => {
    bookIngestionRun.findFirst.mockResolvedValue({ id: 'run-1', storagePath: 'x', sourceDocumentId: 'doc-1', totalPages: 10, draftPurgedAt: new Date() });
    expect((await post({})).status).toBe(410);
  });

  it('builds a native layer from the PDF for free and never calls the OCR provider without allowOcr', async () => {
    queryRaw.mockResolvedValue([candidate(1, { nativeChars: 500 }), candidate(2, { nativeChars: 0 })]);
    buildNativeTextLayers.mockResolvedValue(new Map([[1, nativeLayer]]));
    const response = await post({ batchSize: 2 });
    const data = await response.json();

    expect(buildNativeTextLayers).toHaveBeenCalledWith('books/b/r.pdf', [1]);
    expect(ocrPageWithMathpix).not.toHaveBeenCalled();
    expect(documentPage.update).toHaveBeenCalledTimes(1);
    expect(documentPage.update.mock.calls[0][0]).toMatchObject({ where: { id: 'page-1' }, data: { textLayer: nativeLayer } });
    // The scanned page is counted as needing OCR, not silently read.
    expect(data.batch).toMatchObject({ nativeBuilt: 1, ocrBuilt: 0, ocrSkipped: 1 });
  });

  it('reads scanned pages with OCR only when allowOcr is set, at the stored page size, and keeps going after a failed page', async () => {
    queryRaw.mockResolvedValue([candidate(3), candidate(4)]);
    ocrPageWithMathpix.mockResolvedValueOnce({ textLayer: ocrLayer }).mockRejectedValueOnce(new Error('Mathpix returned 500'));
    const data = await (await post({ allowOcr: true })).json();

    expect(ocrPageWithMathpix).toHaveBeenCalledTimes(2);
    expect(ocrPageWithMathpix).toHaveBeenCalledWith('books/b/r/pages/3.jpg', { width: 1000, height: 1400 });
    expect(documentPage.update).toHaveBeenCalledTimes(1);
    expect(documentPage.update.mock.calls[0][0].data).toEqual({ textLayer: ocrLayer });
    expect(data.batch).toMatchObject({ ocrBuilt: 1, ocrSkipped: 0 });
    expect(data.batch.failures).toEqual([{ pageNumber: 4, error: 'Mathpix returned 500' }]);
    expect(recordAuditLog).toHaveBeenCalledWith(expect.objectContaining({ action: 'BOOK_PAGE_TEXT_LAYERS_BUILT', metadata: expect.objectContaining({ ocrAllowed: true, ocrBuilt: 1 }) }));
  });

  it('upgrades a page whose PDF text is mostly unmapped glyphs by OCR, but keeps the garbled layer when OCR is not allowed', async () => {
    const garbled = { ...nativeLayer, garbled: 0.6 };
    queryRaw.mockResolvedValue([candidate(5, { nativeChars: 300 })]);
    buildNativeTextLayers.mockResolvedValue(new Map([[5, garbled]]));
    const data = await (await post({})).json();
    expect(documentPage.update.mock.calls[0][0].data).toEqual({ textLayer: garbled });
    expect(data.batch).toMatchObject({ nativeBuilt: 1, ocrSkipped: 1 });
    expect(ocrPageWithMathpix).not.toHaveBeenCalled();
  });

  it('caps an OCR batch at 4 pages and reports where to continue', async () => {
    queryRaw.mockResolvedValue([candidate(1), candidate(2), candidate(3), candidate(4)]);
    ocrPageWithMathpix.mockResolvedValue({ textLayer: ocrLayer });
    const data = await (await post({ allowOcr: true, batchSize: 50 })).json();
    // The SQL LIMIT is the batch size, capped for OCR.
    expect(JSON.stringify(queryRaw.mock.calls[0].slice(1))).toContain('4');
    expect(data.nextStartPage).toBe(5);
  });

  it('stops paging when a batch comes back short', async () => {
    queryRaw.mockResolvedValue([candidate(9, { nativeChars: 200 })]);
    buildNativeTextLayers.mockResolvedValue(new Map([[9, nativeLayer]]));
    expect((await (await post({})).json()).nextStartPage).toBeNull();
  });
});
