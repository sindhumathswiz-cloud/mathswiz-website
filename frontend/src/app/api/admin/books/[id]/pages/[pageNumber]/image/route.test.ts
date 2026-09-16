import { beforeEach, describe, expect, it, vi } from 'vitest';

const getAuthenticatedUser = vi.fn();
const book = { findUnique: vi.fn() };
const documentPage = { findFirst: vi.fn() };
const readFile = vi.fn();
const assertPrivatePageImagePath = vi.fn((p: string) => p);

vi.mock('@/lib/auth-server', () => ({ getAuthenticatedUser }));
vi.mock('@/lib/prisma', () => ({ default: { book, documentPage } }));
// Vitest 4 checks a mocked built-in module's shape against the real one --
// node:fs/promises' ESM interop shim exposes a `default` alongside the named
// exports, so the mock needs both or Vitest rejects it.
vi.mock('node:fs/promises', () => ({ readFile, default: { readFile } }));
vi.mock('@/lib/book-storage', () => ({ assertPrivatePageImagePath }));

const params = (pageNumber: string) => Promise.resolve({ id: 'book-1', pageNumber });

describe('GET /api/admin/books/[id]/pages/[pageNumber]/image', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getAuthenticatedUser.mockResolvedValue({ user: { id: 'admin-1', role: 'ADMIN' } });
    book.findUnique.mockResolvedValue({ ingestionRuns: [{ sourceDocumentId: 'doc-1' }] });
    assertPrivatePageImagePath.mockImplementation((p: string) => p);
  });

  it('rejects non-admin callers', async () => {
    getAuthenticatedUser.mockResolvedValue({ error: new Response(null, { status: 403 }) });
    const { GET } = await import('./route');
    const response = (await GET(new Request('http://localhost'), { params: params('12') })) as Response;
    expect(response.status).toBe(403);
  });

  it('rejects a non-numeric page number', async () => {
    const { GET } = await import('./route');
    const response = (await GET(new Request('http://localhost'), { params: params('abc') })) as Response;
    expect(response.status).toBe(400);
  });

  it('404s when the book has no ingestion run', async () => {
    book.findUnique.mockResolvedValue({ ingestionRuns: [] });
    const { GET } = await import('./route');
    const response = (await GET(new Request('http://localhost'), { params: params('12') })) as Response;
    expect(response.status).toBe(404);
  });

  it('404s when no DocumentPage exists for that page number', async () => {
    documentPage.findFirst.mockResolvedValue(null);
    const { GET } = await import('./route');
    const response = (await GET(new Request('http://localhost'), { params: params('999') })) as Response;
    expect(response.status).toBe(404);
    expect(readFile).not.toHaveBeenCalled();
  });

  it('prefers processedImagePath over pageImagePath', async () => {
    documentPage.findFirst.mockResolvedValue({ processedImagePath: '/private/p12-processed.jpg', pageImagePath: '/private/p12.jpg' });
    readFile.mockResolvedValue(Buffer.from('fake-jpeg-bytes'));
    const { GET } = await import('./route');
    const response = (await GET(new Request('http://localhost'), { params: params('12') })) as Response;

    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toBe('image/jpeg');
    expect(assertPrivatePageImagePath).toHaveBeenCalledWith('/private/p12-processed.jpg');
  });

  it('falls back to pageImagePath when processedImagePath is null', async () => {
    documentPage.findFirst.mockResolvedValue({ processedImagePath: null, pageImagePath: '/private/p12.jpg' });
    readFile.mockResolvedValue(Buffer.from('fake-jpeg-bytes'));
    const { GET } = await import('./route');
    await GET(new Request('http://localhost'), { params: params('12') });

    expect(assertPrivatePageImagePath).toHaveBeenCalledWith('/private/p12.jpg');
  });

  it('returns 404 when the file is missing on disk', async () => {
    documentPage.findFirst.mockResolvedValue({ processedImagePath: '/private/p12.jpg', pageImagePath: null });
    readFile.mockRejectedValue(new Error('ENOENT'));
    const { GET } = await import('./route');
    const response = (await GET(new Request('http://localhost'), { params: params('12') })) as Response;
    expect(response.status).toBe(404);
  });
});
