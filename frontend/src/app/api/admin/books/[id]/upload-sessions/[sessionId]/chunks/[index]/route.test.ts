import { beforeEach, describe, expect, it, vi } from 'vitest';

const getAuthenticatedUser = vi.fn();
const writeUploadChunk = vi.fn();
const bookUploadSession = { findFirst: vi.fn(), update: vi.fn() };

vi.mock('@/lib/auth-server', () => ({ getAuthenticatedUser }));
vi.mock('@/lib/book-storage', () => ({ writeUploadChunk }));
vi.mock('@/lib/prisma', () => ({ default: { bookUploadSession } }));

const params = (index: string) => Promise.resolve({ id: 'book-1', sessionId: 'session-1', index });

const baseSession = { id: 'session-1', bookId: 'book-1', createdById: 'admin-1', status: 'IN_PROGRESS', chunkSize: 1000, totalChunks: 3, fileSize: 2500, receivedChunkCount: 0, bytesReceived: 0 };

function putRequest(size: number) {
  // jsdom's Request (this suite's test environment) doesn't correctly
  // round-trip a Blob body through arrayBuffer() -- a real Buffer does.
  return new Request('http://localhost', { method: 'PUT', body: Buffer.alloc(size) as any });
}

describe('PUT /api/admin/books/[id]/upload-sessions/[sessionId]/chunks/[index]', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getAuthenticatedUser.mockResolvedValue({ user: { id: 'admin-1', role: 'ADMIN' } });
    bookUploadSession.findFirst.mockResolvedValue({ ...baseSession });
    writeUploadChunk.mockResolvedValue(undefined);
  });

  it('rejects non-admin roles', async () => {
    getAuthenticatedUser.mockResolvedValue({ error: new Response(null, { status: 403 }) });
    const { PUT } = await import('./route');
    expect((await PUT(putRequest(1000), { params: params('0') }) as Response).status).toBe(403);
  });

  it('404s for a session that does not belong to this admin/book', async () => {
    bookUploadSession.findFirst.mockResolvedValue(null);
    const { PUT } = await import('./route');
    expect((await PUT(putRequest(1000), { params: params('0') }) as Response).status).toBe(404);
  });

  it('rejects a chunk for a session that is not IN_PROGRESS', async () => {
    bookUploadSession.findFirst.mockResolvedValue({ ...baseSession, status: 'COMPLETED' });
    const { PUT } = await import('./route');
    expect((await PUT(putRequest(1000), { params: params('0') }) as Response).status).toBe(409);
  });

  it('rejects an index past totalChunks', async () => {
    const { PUT } = await import('./route');
    expect((await PUT(putRequest(500), { params: params('99') }) as Response).status).toBe(400);
  });

  it('treats a retry of an already-received chunk as a successful no-op', async () => {
    bookUploadSession.findFirst.mockResolvedValue({ ...baseSession, receivedChunkCount: 2, bytesReceived: 2000 });
    const { PUT } = await import('./route');
    const response = await PUT(putRequest(1000), { params: params('0') }) as Response;
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.receivedChunkCount).toBe(2);
    expect(writeUploadChunk).not.toHaveBeenCalled();
    expect(bookUploadSession.update).not.toHaveBeenCalled();
  });

  it('rejects an out-of-order chunk (ahead of what the server has)', async () => {
    const { PUT } = await import('./route');
    const response = await PUT(putRequest(1000), { params: params('2') }) as Response;
    expect(response.status).toBe(409);
    expect(writeUploadChunk).not.toHaveBeenCalled();
  });

  it('rejects a middle chunk that is not exactly chunkSize bytes', async () => {
    const { PUT } = await import('./route');
    const response = await PUT(putRequest(500), { params: params('0') }) as Response;
    expect(response.status).toBe(400);
    expect(writeUploadChunk).not.toHaveBeenCalled();
  });

  it('accepts a final chunk shorter than chunkSize when it matches the remaining byte count', async () => {
    // fileSize 2500, chunkSize 1000 -> chunks of 1000, 1000, 500
    bookUploadSession.findFirst.mockResolvedValue({ ...baseSession, receivedChunkCount: 2, bytesReceived: 2000 });
    bookUploadSession.update.mockResolvedValue({ receivedChunkCount: 3, bytesReceived: 2500, totalChunks: 3 });
    const { PUT } = await import('./route');
    const response = await PUT(putRequest(500), { params: params('2') }) as Response;
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.complete).toBe(true);
    expect(writeUploadChunk).toHaveBeenCalledWith('book-1', 'session-1', 2, expect.any(Buffer));
  });

  it('rejects an empty chunk', async () => {
    const { PUT } = await import('./route');
    expect((await PUT(putRequest(0), { params: params('0') }) as Response).status).toBe(400);
  });

  it('writes a valid in-order chunk and increments the running counters', async () => {
    bookUploadSession.update.mockResolvedValue({ receivedChunkCount: 1, bytesReceived: 1000, totalChunks: 3 });
    const { PUT } = await import('./route');
    const response = await PUT(putRequest(1000), { params: params('0') }) as Response;
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toEqual({ receivedChunkCount: 1, bytesReceived: 1000, complete: false });
    expect(writeUploadChunk).toHaveBeenCalledWith('book-1', 'session-1', 0, expect.any(Buffer));
    expect(bookUploadSession.update).toHaveBeenCalledWith({ where: { id: 'session-1' }, data: { receivedChunkCount: { increment: 1 }, bytesReceived: { increment: 1000 } } });
  });
});
