import { beforeEach, describe, expect, it, vi } from 'vitest';

const getAuthenticatedUser = vi.fn();
const deleteUploadSessionChunks = vi.fn();
const bookUploadSession = { findFirst: vi.fn(), update: vi.fn() };

vi.mock('@/lib/auth-server', () => ({ getAuthenticatedUser }));
vi.mock('@/lib/book-storage', () => ({ deleteUploadSessionChunks }));
vi.mock('@/lib/prisma', () => ({ default: { bookUploadSession } }));

const params = () => Promise.resolve({ id: 'book-1', sessionId: 'session-1' });

describe('/api/admin/books/[id]/upload-sessions/[sessionId]', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getAuthenticatedUser.mockResolvedValue({ user: { id: 'admin-1', role: 'ADMIN' } });
  });

  describe('GET', () => {
    it('rejects non-admin roles', async () => {
      getAuthenticatedUser.mockResolvedValue({ error: new Response(null, { status: 403 }) });
      const { GET } = await import('./route');
      expect((await GET(new Request('http://localhost'), { params: params() }) as Response).status).toBe(403);
    });

    it('404s when no matching session exists', async () => {
      bookUploadSession.findFirst.mockResolvedValue(null);
      const { GET } = await import('./route');
      expect((await GET(new Request('http://localhost'), { params: params() }) as Response).status).toBe(404);
    });

    it('returns the session', async () => {
      bookUploadSession.findFirst.mockResolvedValue({ id: 'session-1', receivedChunkCount: 2, totalChunks: 5 });
      const { GET } = await import('./route');
      const response = await GET(new Request('http://localhost'), { params: params() }) as Response;
      expect(response.status).toBe(200);
      expect((await response.json()).session).toEqual({ id: 'session-1', receivedChunkCount: 2, totalChunks: 5 });
    });
  });

  describe('DELETE', () => {
    it('404s when no matching session exists', async () => {
      bookUploadSession.findFirst.mockResolvedValue(null);
      const { DELETE } = await import('./route');
      expect((await DELETE(new Request('http://localhost'), { params: params() }) as Response).status).toBe(404);
    });

    it('refuses to cancel an already-completed session', async () => {
      bookUploadSession.findFirst.mockResolvedValue({ id: 'session-1', status: 'COMPLETED', totalChunks: 5 });
      const { DELETE } = await import('./route');
      const response = await DELETE(new Request('http://localhost'), { params: params() }) as Response;
      expect(response.status).toBe(409);
      expect(deleteUploadSessionChunks).not.toHaveBeenCalled();
    });

    it('cleans up chunks and marks the session FAILED', async () => {
      bookUploadSession.findFirst.mockResolvedValue({ id: 'session-1', status: 'IN_PROGRESS', totalChunks: 5 });
      const { DELETE } = await import('./route');
      const response = await DELETE(new Request('http://localhost'), { params: params() }) as Response;
      expect(response.status).toBe(200);
      expect(deleteUploadSessionChunks).toHaveBeenCalledWith('book-1', 'session-1', 5);
      expect(bookUploadSession.update).toHaveBeenCalledWith({ where: { id: 'session-1' }, data: { status: 'FAILED', errorMessage: 'Cancelled by admin' } });
    });
  });
});
