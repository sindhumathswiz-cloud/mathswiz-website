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

  it('proposes chapters and sections from the page text without writing anything', async () => {
    book.findUnique.mockResolvedValue({
      id: 'book-1', className: 'Class 12',
      ingestionRuns: [{ id: 'run-1', sourceDocumentId: 'doc-1', totalPages: 12 }],
    });
    documentPage.findMany.mockResolvedValue([
      { pageNumber: 3, rawText: 'VECTOR ALGEBRA\nMULTIPLE CHOICE QUESTIONS\n1. The magnitude of ...', layoutData: null },
      { pageNumber: 4, rawText: 'VECTOR ALGEBRA\n2. If the vectors ...', layoutData: null },
      { pageNumber: 5, rawText: 'Answers\n1. (a) 2. (b) 3. (c) 4. (d) 5. (a) 6. (c) 7. (d) 8. (b)', layoutData: null },
    ]);

    const { POST } = await import('./route');
    const data = await (await POST(req(), { params }) as Response).json();

    expect(data.runId).toBe('run-1');
    expect(data.pagesScanned).toBe(3);
    expect(data.proposal.chapters[0].name).toBe('Vector Algebra');
    expect(data.proposal.chapters[0].sections[0].sectionType).toBe('MCQ');
    expect(data.proposal.chapters[0].sections[0].answerKeyStartPage).toBe(5);
    expect(recordAuditLog).toHaveBeenCalledWith(expect.objectContaining({ action: 'BOOK_MANIFEST_DETECTED' }));
  });

  it('409s before pages are rendered', async () => {
    book.findUnique.mockResolvedValue({ id: 'book-1', className: 'Class 12', ingestionRuns: [{ id: 'run-1', sourceDocumentId: null, totalPages: null }] });
    const { POST } = await import('./route');
    expect((await POST(req(), { params }) as Response).status).toBe(409);
  });
});
