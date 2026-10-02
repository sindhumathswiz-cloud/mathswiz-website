import { beforeEach, describe, expect, it, vi } from 'vitest';

const getAuthenticatedUser = vi.fn();
const recordAuditLog = vi.fn();
const validateBookPdf = vi.fn();
const registerBookPdf = vi.fn();
const book = { findUnique: vi.fn() };
const bookIngestionRun = { findMany: vi.fn() };

class FakeDuplicateBookPdfError extends Error {
  duplicate: { id: string; status: string; stage: string };
  constructor(duplicate: { id: string; status: string; stage: string }) {
    super('This exact PDF is already registered for the book');
    this.duplicate = duplicate;
  }
}

vi.mock('@/lib/auth-server', () => ({ getAuthenticatedUser }));
vi.mock('@/lib/audit-log', () => ({ recordAuditLog, requestAuditContext: () => ({}) }));
vi.mock('@/lib/book-storage', () => ({ validateBookPdf }));
vi.mock('@/lib/book-ingestion-intake', () => ({ registerBookPdf, DuplicateBookPdfError: FakeDuplicateBookPdfError }));
vi.mock('@/lib/prisma', () => ({ default: { book, bookIngestionRun } }));

const params = (id: string) => Promise.resolve({ id });

function uploadRequest(file: File) {
  const form = new FormData();
  form.set('file', file);
  return new Request('http://localhost', { method: 'POST', body: form });
}

describe('POST /api/admin/books/[id]/ingestions (whole-file upload)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getAuthenticatedUser.mockResolvedValue({ user: { id: 'admin-1', role: 'ADMIN' } });
    book.findUnique.mockResolvedValue({ id: 'book-1', title: 'Calculus', className: 'Class 12', subject: 'Mathematics' });
    validateBookPdf.mockReturnValue(undefined);
    registerBookPdf.mockResolvedValue({ ingestionRun: { id: 'run-1' }, fileHash: 'hash-1' });
  });

  it('rejects non-admin roles', async () => {
    getAuthenticatedUser.mockResolvedValue({ error: new Response(null, { status: 403 }) });
    const { POST } = await import('./route');
    const file = new File([Buffer.from('%PDF-1.7')], 'book.pdf', { type: 'application/pdf' });
    expect((await POST(uploadRequest(file), { params: params('book-1') }) as Response).status).toBe(403);
  });

  it('404s for a book that does not exist', async () => {
    book.findUnique.mockResolvedValue(null);
    const { POST } = await import('./route');
    const file = new File([Buffer.from('%PDF-1.7')], 'book.pdf', { type: 'application/pdf' });
    expect((await POST(uploadRequest(file), { params: params('missing') }) as Response).status).toBe(404);
  });

  it('rejects a request with no file', async () => {
    const { POST } = await import('./route');
    const response = await POST(new Request('http://localhost', { method: 'POST', body: new FormData() }), { params: params('book-1') }) as Response;
    expect(response.status).toBe(400);
  });

  // Routing the request through File/FormData -> Request.formData() and back
  // out only reliably preserves `instanceof File` in a real browser/Node
  // fetch implementation -- jsdom's FormData polyfill (this suite's test
  // environment) doesn't round-trip File identity the same way, so the
  // success/duplicate/failure paths past that check are covered instead via
  // the chunked-upload finalize route's tests, which exercise the exact
  // same shared registerBookPdf()/DuplicateBookPdfError logic without going
  // through FormData at all. These tests stick to the guard clauses that
  // don't depend on that round-trip.
});
