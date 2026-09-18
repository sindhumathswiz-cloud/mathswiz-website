import { beforeEach, describe, expect, it, vi } from 'vitest';

const getAuthenticatedUser = vi.fn();
const book = { findUnique: vi.fn() };
const documentPage = { findFirst: vi.fn() };
const readPrivateImage = vi.fn();
const assertPrivateImageReference = vi.fn((p: string) => p);

vi.mock('@/lib/auth-server', () => ({ getAuthenticatedUser }));
vi.mock('@/lib/prisma', () => ({ default: { book, documentPage } }));
vi.mock('@/lib/book-storage', () => ({ assertPrivateImageReference, readPrivateImage }));

const params = (pageNumber: string) => Promise.resolve({ id: 'book-1', pageNumber });

describe('GET /api/admin/books/[id]/pages/[pageNumber]/image', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getAuthenticatedUser.mockResolvedValue({ user: { id: 'admin-1', role: 'ADMIN' } });
    book.findUnique.mockResolvedValue({ ingestionRuns: [{ sourceDocumentId: 'doc-1' }] });
    assertPrivateImageReference.mockImplementation((p: string) => p);
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
    expect(readPrivateImage).not.toHaveBeenCalled();
  });

  it('prefers processedImagePath over pageImagePath', async () => {
    documentPage.findFirst.mockResolvedValue({ processedImagePath: '/private/p12-processed.jpg', pageImagePath: '/private/p12.jpg' });
    readPrivateImage.mockResolvedValue(Buffer.from('fake-jpeg-bytes'));
    const { GET } = await import('./route');
    const response = (await GET(new Request('http://localhost'), { params: params('12') })) as Response;

    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toBe('image/jpeg');
    expect(assertPrivateImageReference).toHaveBeenCalledWith('/private/p12-processed.jpg');
    expect(readPrivateImage).toHaveBeenCalledWith('/private/p12-processed.jpg');
  });

  it('falls back to pageImagePath when processedImagePath is null', async () => {
    documentPage.findFirst.mockResolvedValue({ processedImagePath: null, pageImagePath: '/private/p12.jpg' });
    readPrivateImage.mockResolvedValue(Buffer.from('fake-jpeg-bytes'));
    const { GET } = await import('./route');
    await GET(new Request('http://localhost'), { params: params('12') });

    expect(assertPrivateImageReference).toHaveBeenCalledWith('/private/p12.jpg');
  });

  it('returns 404 when the file is missing (or the Supabase download fails)', async () => {
    documentPage.findFirst.mockResolvedValue({ processedImagePath: '/private/p12.jpg', pageImagePath: null });
    readPrivateImage.mockRejectedValue(new Error('ENOENT'));
    const { GET } = await import('./route');
    const response = (await GET(new Request('http://localhost'), { params: params('12') })) as Response;
    expect(response.status).toBe(404);
  });
});
