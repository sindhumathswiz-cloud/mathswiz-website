import { beforeEach, describe, expect, it, vi } from 'vitest';

const getAuthenticatedUser = vi.fn();
const recordAuditLog = vi.fn();
const deleteUploadSessionChunks = vi.fn();
const book = { findUnique: vi.fn() };
const bookUploadSession = { findMany: vi.fn(), findFirst: vi.fn(), create: vi.fn(), update: vi.fn() };

vi.mock('@/lib/auth-server', () => ({ getAuthenticatedUser }));
vi.mock('@/lib/audit-log', () => ({ recordAuditLog, requestAuditContext: () => ({}) }));
vi.mock('@/lib/book-storage', () => ({ MAX_BOOK_PDF_BYTES: 250 * 1024 * 1024, deleteUploadSessionChunks }));
vi.mock('@/lib/prisma', () => ({ default: { book, bookUploadSession } }));

const params = (id: string) => Promise.resolve({ id });

describe('POST /api/admin/books/[id]/upload-sessions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getAuthenticatedUser.mockResolvedValue({ user: { id: 'admin-1', role: 'ADMIN' } });
    book.findUnique.mockResolvedValue({ id: 'book-1' });
    bookUploadSession.findMany.mockResolvedValue([]);
    bookUploadSession.findFirst.mockResolvedValue(null);
    bookUploadSession.update.mockResolvedValue({});
  });

  it('rejects non-admin roles', async () => {
    getAuthenticatedUser.mockResolvedValue({ error: new Response(null, { status: 403 }) });
    const { POST } = await import('./route');
    const response = await POST(new Request('http://localhost', { method: 'POST', body: '{}' }), { params: params('book-1') }) as Response;
    expect(response.status).toBe(403);
  });

  it('404s for a book that does not exist', async () => {
    book.findUnique.mockResolvedValue(null);
    const { POST } = await import('./route');
    const response = await POST(new Request('http://localhost', { method: 'POST', body: JSON.stringify({ fileName: 'a.pdf', fileSize: 1000 }) }), { params: params('missing') }) as Response;
    expect(response.status).toBe(404);
  });

  it('rejects a non-PDF file name', async () => {
    const { POST } = await import('./route');
    const response = await POST(new Request('http://localhost', { method: 'POST', body: JSON.stringify({ fileName: 'notes.docx', fileSize: 1000 }) }), { params: params('book-1') }) as Response;
    expect(response.status).toBe(400);
    expect(bookUploadSession.create).not.toHaveBeenCalled();
  });

  it('rejects a file over the 250MB pilot limit', async () => {
    const { POST } = await import('./route');
    const response = await POST(new Request('http://localhost', { method: 'POST', body: JSON.stringify({ fileName: 'big.pdf', fileSize: 251 * 1024 * 1024 }) }), { params: params('book-1') }) as Response;
    expect(response.status).toBe(400);
    expect(bookUploadSession.create).not.toHaveBeenCalled();
  });

  it('creates a new session with the correct chunk count', async () => {
    bookUploadSession.create.mockResolvedValue({ id: 'session-1', totalChunks: 3, receivedChunkCount: 0 });
    const { POST, CHUNK_SIZE_BYTES } = await import('./route');
    const fileSize = CHUNK_SIZE_BYTES * 2 + 100;
    const response = await POST(new Request('http://localhost', { method: 'POST', body: JSON.stringify({ fileName: 'book.pdf', fileSize }) }), { params: params('book-1') }) as Response;
    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body.resumed).toBe(false);
    expect(bookUploadSession.create).toHaveBeenCalledWith({ data: expect.objectContaining({ bookId: 'book-1', createdById: 'admin-1', fileName: 'book.pdf', fileSize, chunkSize: CHUNK_SIZE_BYTES, totalChunks: 3 }) });
    expect(recordAuditLog).toHaveBeenCalledWith(expect.objectContaining({ action: 'BOOK_UPLOAD_SESSION_STARTED' }));
  });

  it('resumes an existing in-progress session for the same book/admin/file instead of creating a new one', async () => {
    const existing = { id: 'session-existing', receivedChunkCount: 5, totalChunks: 10 };
    bookUploadSession.findFirst.mockResolvedValue(existing);
    const { POST } = await import('./route');
    const response = await POST(new Request('http://localhost', { method: 'POST', body: JSON.stringify({ fileName: 'book.pdf', fileSize: 40_000_000 }) }), { params: params('book-1') }) as Response;
    const body = await response.json();
    expect(body.resumed).toBe(true);
    expect(body.session).toEqual(existing);
    expect(bookUploadSession.create).not.toHaveBeenCalled();
  });

  it('sweeps stale (48h+ untouched) in-progress sessions before creating or resuming', async () => {
    bookUploadSession.findMany.mockResolvedValue([{ id: 'stale-1', totalChunks: 5 }]);
    bookUploadSession.create.mockResolvedValue({ id: 'session-new', totalChunks: 1, receivedChunkCount: 0 });
    const { POST } = await import('./route');
    await POST(new Request('http://localhost', { method: 'POST', body: JSON.stringify({ fileName: 'book.pdf', fileSize: 1000 }) }), { params: params('book-1') });
    expect(deleteUploadSessionChunks).toHaveBeenCalledWith('book-1', 'stale-1', 5);
    expect(bookUploadSession.update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'stale-1' }, data: expect.objectContaining({ status: 'FAILED' }) }));
  });
});
