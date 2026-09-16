import { beforeEach, describe, expect, it, vi } from 'vitest';

const getAuthenticatedUser = vi.fn();
const recordAuditLog = vi.fn();
const book = { findUnique: vi.fn() };
const documentPage = { findMany: vi.fn() };

vi.mock('@/lib/auth-server', () => ({ getAuthenticatedUser }));
vi.mock('@/lib/prisma', () => ({ default: { book, documentPage } }));
vi.mock('@/lib/audit-log', () => ({ recordAuditLog, requestAuditContext: () => ({}) }));

const params = Promise.resolve({ id: 'book-1' });
const req = () => new Request('http://localhost/api/admin/books/book-1/manifest/detect', { method: 'POST' });

describe('POST /api/admin/books/[id]/manifest/detect', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getAuthenticatedUser.mockResolvedValue({ user: { id: 'admin-1', role: 'ADMIN' } });
  });

  it('proposes chapters from the table of contents with a detected page offset, writing nothing', async () => {
    book.findUnique.mockResolvedValue({
      id: 'book-1', className: 'Class 12',
      ingestionRuns: [{ id: 'run-1', sourceDocumentId: 'doc-1', totalPages: 60 }],
    });
    const toc = [
      'Contents',
      '\\hline 1. Vector Algebra & 5 \\\\',
      '\\hline 2. Probability & 30 \\\\',
      '\\hline 3. Determinants & 45 \\\\',
      '\\hline \\multicolumn{2}{|c|}{PART-B} \\\\',
      '\\hline CBSE Sample Paper & 55 \\\\',
    ].join('\n');
    documentPage.findMany.mockResolvedValue([
      { pageNumber: 3, rawText: toc, layoutData: null },
      { pageNumber: 8, rawText: 'Vector Algebra 1 basic pts\n1. The magnitude of ...', layoutData: null },   // 5 + 3
      { pageNumber: 10, rawText: 'VECTOR ALGEBRA\nMULTIPLE CHOICE QUESTIONS\n1. ...', layoutData: null },
      { pageNumber: 12, rawText: 'Answers\n1. (a) 2. (b) 3. (c) 4. (d) 5. (a) 6. (c) 7. (d) 8. (b)', layoutData: null },
      { pageNumber: 33, rawText: 'Probability 2 basic pts\n1. Conditional probability ...', layoutData: null }, // 30 + 3
    ]);

    const { POST } = await import('./route');
    const data = await (await POST(req(), { params }) as Response).json();

    expect(data.tocFound).toBe(true);
    expect(data.pageOffset).toBe(3);
    expect(data.proposal.chapters.map((c: { name: string }) => c.name)).toEqual(['Vector Algebra', 'Probability', 'Determinants']);
    expect(data.proposal.chapters[0].printedStartPage).toBe(5);
    expect(data.proposal.chapters[0].startPage).toBe(8);
    expect(recordAuditLog).toHaveBeenCalledWith(expect.objectContaining({ action: 'BOOK_MANIFEST_DETECTED' }));
  });

  it('409s before pages are rendered', async () => {
    book.findUnique.mockResolvedValue({ id: 'book-1', className: 'Class 12', ingestionRuns: [{ id: 'run-1', sourceDocumentId: null, totalPages: null }] });
    const { POST } = await import('./route');
    expect((await POST(req(), { params }) as Response).status).toBe(409);
  });

  it('falls back to nativeText when rawText is not yet populated (a DIGITAL_MATH book right after rendering, before any extraction has run)', async () => {
    // rawText is only ever written by extract-questions -- gating detection
    // on it alone would force a full extraction pass before the manifest
    // could even be reviewed, defeating the point of confirming a manifest
    // BEFORE extracting. render-pages already captures the PDF's own text
    // layer as nativeText, which is enough for detection on its own.
    book.findUnique.mockResolvedValue({
      id: 'book-1', className: 'Class 12',
      ingestionRuns: [{ id: 'run-1', sourceDocumentId: 'doc-1', totalPages: 40 }],
    });
    documentPage.findMany.mockResolvedValue([
      { pageNumber: 10, rawText: '', nativeText: 'VECTOR ALGEBRA\nMULTIPLE CHOICE QUESTIONS\n1. ...', layoutData: null },
      { pageNumber: 12, rawText: '', nativeText: 'Answers\n1. (a) 2. (b) 3. (c) 4. (d) 5. (a) 6. (c) 7. (d) 8. (b)', layoutData: null },
    ]);

    const { POST } = await import('./route');
    const response = (await POST(req(), { params })) as Response;
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.pagesScanned).toBe(2);
    expect(documentPage.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ OR: [{ rawText: { not: '' } }, { nativeText: { not: '' } }] }),
    }));
  });

  it('409s with a distinct message when neither rawText nor nativeText exists for any page', async () => {
    book.findUnique.mockResolvedValue({
      id: 'book-1', className: 'Class 12',
      ingestionRuns: [{ id: 'run-1', sourceDocumentId: 'doc-1', totalPages: 40 }],
    });
    documentPage.findMany.mockResolvedValue([]);

    const { POST } = await import('./route');
    const response = (await POST(req(), { params })) as Response;
    const data = await response.json();

    expect(response.status).toBe(409);
    expect(data.error).toMatch(/No page text is available yet/);
  });
});
