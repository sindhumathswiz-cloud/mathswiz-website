import { beforeEach, describe, expect, it, vi } from 'vitest';

const getAuthenticatedUser = vi.fn();
const bookIngestionRun = { findFirst: vi.fn() };
const readPrivateImage = vi.fn();
const privateImageReference = vi.fn((bookId: string, runId: string, _kind: string, fileName: string) => `/private/${bookId}/runs/${runId}/question-images/${fileName}`);

vi.mock('@/lib/auth-server', () => ({ getAuthenticatedUser }));
vi.mock('@/lib/prisma', () => ({ default: { bookIngestionRun } }));
vi.mock('@/lib/book-storage', () => ({ privateImageReference, readPrivateImage }));

const params = (path: string[]) => Promise.resolve({ id: 'book-1', runId: 'run-1', path });

describe('GET /api/admin/books/[id]/ingestions/[runId]/question-images/[...path]', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getAuthenticatedUser.mockResolvedValue({ user: { id: 'admin-1', role: 'ADMIN' } });
    bookIngestionRun.findFirst.mockResolvedValue({ id: 'run-1' });
    privateImageReference.mockImplementation((bookId: string, runId: string, _kind: string, fileName: string) => `/private/${bookId}/runs/${runId}/question-images/${fileName}`);
  });

  it('rejects non-admin callers', async () => {
    getAuthenticatedUser.mockResolvedValue({ error: new Response(null, { status: 403 }) });
    const { GET } = await import('./route');
    const response = (await GET(new Request('http://localhost'), { params: params(['q-1-0.jpg']) })) as Response;
    expect(response.status).toBe(403);
  });

  it('404s when the run does not belong to the book', async () => {
    bookIngestionRun.findFirst.mockResolvedValue(null);
    const { GET } = await import('./route');
    const response = (await GET(new Request('http://localhost'), { params: params(['q-1-0.jpg']) })) as Response;
    expect(response.status).toBe(404);
  });

  it('rejects a path with more than one segment', async () => {
    const { GET } = await import('./route');
    const response = (await GET(new Request('http://localhost'), { params: params(['sub', 'q-1-0.jpg']) })) as Response;
    expect(response.status).toBe(400);
    expect(readPrivateImage).not.toHaveBeenCalled();
  });

  it('rejects a path/key validation failure (e.g. traversal) without reading the file', async () => {
    privateImageReference.mockImplementation(() => { throw new Error('Invalid private page image path'); });
    const { GET } = await import('./route');
    const response = (await GET(new Request('http://localhost'), { params: params(['secret.jpg']) })) as Response;
    expect(response.status).toBe(400);
    expect(readPrivateImage).not.toHaveBeenCalled();
  });

  it('streams the cropped image with the right content type', async () => {
    readPrivateImage.mockResolvedValue(Buffer.from('fake-jpeg-bytes'));
    const { GET } = await import('./route');
    const response = (await GET(new Request('http://localhost'), { params: params(['q-1-0.jpg']) })) as Response;

    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toBe('image/jpeg');
    expect(privateImageReference).toHaveBeenCalledWith('book-1', 'run-1', 'question-images', 'q-1-0.jpg');
    expect(readPrivateImage).toHaveBeenCalledWith('/private/book-1/runs/run-1/question-images/q-1-0.jpg');
  });

  it('returns 404 when the file is missing (or the Supabase download fails)', async () => {
    readPrivateImage.mockRejectedValue(new Error('ENOENT'));
    const { GET } = await import('./route');
    const response = (await GET(new Request('http://localhost'), { params: params(['missing.jpg']) })) as Response;
    expect(response.status).toBe(404);
  });
});
