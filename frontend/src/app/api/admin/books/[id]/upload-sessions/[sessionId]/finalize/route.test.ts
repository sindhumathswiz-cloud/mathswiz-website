import { beforeEach, describe, expect, it, vi } from 'vitest';

const getAuthenticatedUser = vi.fn();
const recordAuditLog = vi.fn();
const assembleUploadSession = vi.fn();
const deleteUploadSessionChunks = vi.fn();
const validateBookPdf = vi.fn();
const registerBookPdf = vi.fn();
const book = { findUnique: vi.fn() };
const bookUploadSession = { findFirst: vi.fn(), update: vi.fn() };
const bookIngestionRun = { findUnique: vi.fn() };

class FakeDuplicateBookPdfError extends Error {
  duplicate: { id: string; status: string; stage: string };
  constructor(duplicate: { id: string; status: string; stage: string }) {
    super('This exact PDF is already registered for the book');
    this.duplicate = duplicate;
  }
}

vi.mock('@/lib/auth-server', () => ({ getAuthenticatedUser }));
vi.mock('@/lib/audit-log', () => ({ recordAuditLog, requestAuditContext: () => ({}) }));
vi.mock('@/lib/book-storage', () => ({ assembleUploadSession, deleteUploadSessionChunks, validateBookPdf }));
vi.mock('@/lib/book-ingestion-intake', () => ({ registerBookPdf, DuplicateBookPdfError: FakeDuplicateBookPdfError }));
vi.mock('@/lib/prisma', () => ({ default: { book, bookUploadSession, bookIngestionRun } }));

const params = () => Promise.resolve({ id: 'book-1', sessionId: 'session-1' });

const readySession = { id: 'session-1', bookId: 'book-1', createdById: 'admin-1', status: 'IN_PROGRESS', totalChunks: 3, receivedChunkCount: 3, fileName: 'book.pdf', ingestionRunId: null };

describe('POST .../upload-sessions/[sessionId]/finalize', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getAuthenticatedUser.mockResolvedValue({ user: { id: 'admin-1', role: 'ADMIN' } });
    book.findUnique.mockResolvedValue({ id: 'book-1', title: 'Calculus', className: 'Class 12', subject: 'Mathematics' });
    bookUploadSession.findFirst.mockResolvedValue({ ...readySession });
    assembleUploadSession.mockResolvedValue(Buffer.from('%PDF-1.7\n%%EOF'));
    validateBookPdf.mockReturnValue(undefined);
    registerBookPdf.mockResolvedValue({ ingestionRun: { id: 'run-1' }, fileHash: 'hash-1' });
    bookUploadSession.update.mockResolvedValue({});
  });

  it('rejects non-admin roles', async () => {
    getAuthenticatedUser.mockResolvedValue({ error: new Response(null, { status: 403 }) });
    const { POST } = await import('./route');
    expect((await POST(new Request('http://localhost', { method: 'POST' }), { params: params() }) as Response).status).toBe(403);
  });

  it('404s when the book is missing', async () => {
    book.findUnique.mockResolvedValue(null);
    const { POST } = await import('./route');
    expect((await POST(new Request('http://localhost', { method: 'POST' }), { params: params() }) as Response).status).toBe(404);
  });

  it('404s when the session is missing', async () => {
    bookUploadSession.findFirst.mockResolvedValue(null);
    const { POST } = await import('./route');
    expect((await POST(new Request('http://localhost', { method: 'POST' }), { params: params() }) as Response).status).toBe(404);
  });

  it('rejects finalizing before every chunk has arrived', async () => {
    bookUploadSession.findFirst.mockResolvedValue({ ...readySession, receivedChunkCount: 1 });
    const { POST } = await import('./route');
    const response = await POST(new Request('http://localhost', { method: 'POST' }), { params: params() }) as Response;
    expect(response.status).toBe(400);
    expect(assembleUploadSession).not.toHaveBeenCalled();
  });

  it('returns the existing ingestion run idempotently if already completed', async () => {
    bookUploadSession.findFirst.mockResolvedValue({ ...readySession, status: 'COMPLETED', ingestionRunId: 'run-1' });
    bookIngestionRun.findUnique.mockResolvedValue({ id: 'run-1', stage: 'STORED' });
    const { POST } = await import('./route');
    const response = await POST(new Request('http://localhost', { method: 'POST' }), { params: params() }) as Response;
    expect(response.status).toBe(200);
    expect(registerBookPdf).not.toHaveBeenCalled();
  });

  it('assembles, validates, registers, and marks the session completed', async () => {
    const { POST } = await import('./route');
    const response = await POST(new Request('http://localhost', { method: 'POST' }), { params: params() }) as Response;
    expect(response.status).toBe(201);
    expect(assembleUploadSession).toHaveBeenCalledWith('book-1', 'session-1', 3);
    expect(registerBookPdf).toHaveBeenCalledWith(expect.objectContaining({ bookId: 'book-1', fileName: 'book.pdf', adminId: 'admin-1' }));
    expect(bookUploadSession.update).toHaveBeenCalledWith({ where: { id: 'session-1' }, data: { status: 'COMPLETED', ingestionRunId: 'run-1' } });
    expect(deleteUploadSessionChunks).toHaveBeenCalledWith('book-1', 'session-1', 3);
    expect(recordAuditLog).toHaveBeenCalledWith(expect.objectContaining({ action: 'BOOK_PDF_STORED', entityId: 'run-1' }));
  });

  it('marks the session FAILED and cleans up chunks on a duplicate-PDF error', async () => {
    registerBookPdf.mockRejectedValue(new FakeDuplicateBookPdfError({ id: 'existing-run', status: 'COMPLETED', stage: 'COMPLETED' }));
    const { POST } = await import('./route');
    const response = await POST(new Request('http://localhost', { method: 'POST' }), { params: params() }) as Response;
    expect(response.status).toBe(409);
    expect(bookUploadSession.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: 'FAILED' }) }));
    expect(deleteUploadSessionChunks).toHaveBeenCalledWith('book-1', 'session-1', 3);
  });

  it('leaves the session IN_PROGRESS (chunks intact) on an unexpected storage failure, so finalize can just be retried', async () => {
    registerBookPdf.mockRejectedValue(new Error('disk full'));
    const { POST } = await import('./route');
    const response = await POST(new Request('http://localhost', { method: 'POST' }), { params: params() }) as Response;
    expect(response.status).toBe(500);
    expect(bookUploadSession.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: 'IN_PROGRESS', errorMessage: 'disk full' }) }));
    expect(deleteUploadSessionChunks).not.toHaveBeenCalled();
  });
});
