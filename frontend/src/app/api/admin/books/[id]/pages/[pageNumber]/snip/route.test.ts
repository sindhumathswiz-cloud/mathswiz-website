import { beforeEach, describe, expect, it, vi } from 'vitest';

const getAuthenticatedUser = vi.fn();
const book = { findUnique: vi.fn() };
const documentPage = { findFirst: vi.fn() };
const cropPageRegion = vi.fn();
const ocrPageWithMathpix = vi.fn();
const unlink = vi.fn();

vi.mock('@/lib/auth-server', () => ({ getAuthenticatedUser }));
vi.mock('@/lib/prisma', () => ({ default: { book, documentPage } }));
vi.mock('@/lib/page-image-crop', () => ({ cropPageRegion }));
vi.mock('@/lib/extract-book-page', () => ({ ocrPageWithMathpix }));
vi.mock('node:fs/promises', () => ({ unlink, default: { unlink } }));

function post(body: unknown) {
  return new Request('http://localhost/api/admin/books/book-1/pages/12/snip', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

const params = (pageNumber: string) => Promise.resolve({ id: 'book-1', pageNumber });

describe('POST /api/admin/books/[id]/pages/[pageNumber]/snip', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getAuthenticatedUser.mockResolvedValue({ user: { id: 'admin-1', role: 'ADMIN' } });
    book.findUnique.mockResolvedValue({ ingestionRuns: [{ id: 'run-1', sourceDocumentId: 'doc-1' }] });
    documentPage.findFirst.mockResolvedValue({ processedImagePath: '/private/p12.jpg', pageImagePath: null });
    cropPageRegion.mockResolvedValue({ imagePath: '/private/snip-123.jpg', width: 300, height: 120 });
    ocrPageWithMathpix.mockResolvedValue({ text: '$A \\times B$', confidence: 0.9, diagramRegions: [], textLines: [], safeImagePath: '/private/snip-123.jpg' });
    unlink.mockResolvedValue(undefined);
  });

  it('rejects non-admin callers', async () => {
    getAuthenticatedUser.mockResolvedValue({ error: new Response(null, { status: 403 }) });
    const { POST } = await import('./route');
    const response = (await POST(post({ x: 0, y: 0, width: 100, height: 50 }), { params: params('12') })) as Response;
    expect(response.status).toBe(403);
  });

  it('rejects a non-numeric page number', async () => {
    const { POST } = await import('./route');
    const response = (await POST(post({ x: 0, y: 0, width: 100, height: 50 }), { params: params('abc') })) as Response;
    expect(response.status).toBe(400);
  });

  it('rejects a missing/malformed region', async () => {
    const { POST } = await import('./route');
    const response = (await POST(post({}), { params: params('12') })) as Response;
    expect(response.status).toBe(400);
    expect(cropPageRegion).not.toHaveBeenCalled();
  });

  it('rejects a region below the minimum dimension', async () => {
    const { POST } = await import('./route');
    const response = (await POST(post({ x: 0, y: 0, width: 5, height: 5 }), { params: params('12') })) as Response;
    expect(response.status).toBe(400);
    expect(cropPageRegion).not.toHaveBeenCalled();
  });

  it('rejects a region above the maximum dimension', async () => {
    const { POST } = await import('./route');
    const response = (await POST(post({ x: 0, y: 0, width: 5000, height: 100 }), { params: params('12') })) as Response;
    expect(response.status).toBe(400);
    expect(cropPageRegion).not.toHaveBeenCalled();
  });

  it('404s when the book has no ingestion run', async () => {
    book.findUnique.mockResolvedValue({ ingestionRuns: [] });
    const { POST } = await import('./route');
    const response = (await POST(post({ x: 0, y: 0, width: 100, height: 50 }), { params: params('12') })) as Response;
    expect(response.status).toBe(404);
  });

  it('404s when no DocumentPage exists for that page number', async () => {
    documentPage.findFirst.mockResolvedValue(null);
    const { POST } = await import('./route');
    const response = (await POST(post({ x: 0, y: 0, width: 100, height: 50 }), { params: params('999') })) as Response;
    expect(response.status).toBe(404);
    expect(cropPageRegion).not.toHaveBeenCalled();
  });

  it('crops the region, OCRs the crop, returns the text, and cleans up the temp file', async () => {
    const { POST } = await import('./route');
    const response = (await POST(post({ x: 10, y: 20, width: 300, height: 120 }), { params: params('12') })) as Response;
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.text).toBe('$A \\times B$');
    expect(cropPageRegion).toHaveBeenCalledWith(
      'book-1', 'run-1', '/private/p12.jpg',
      expect.stringMatching(/^snip-\d+-[a-z0-9]+\.jpg$/),
      { x: 10, y: 20, width: 300, height: 120 },
    );
    expect(ocrPageWithMathpix).toHaveBeenCalledWith('/private/snip-123.jpg');
    expect(unlink).toHaveBeenCalledWith('/private/snip-123.jpg');
  });

  it('still cleans up the crop file when OCR fails', async () => {
    ocrPageWithMathpix.mockRejectedValue(new Error('Mathpix credentials are not configured'));
    const { POST } = await import('./route');
    const response = (await POST(post({ x: 10, y: 20, width: 300, height: 120 }), { params: params('12') })) as Response;

    expect(response.status).toBe(500);
    expect(unlink).toHaveBeenCalledWith('/private/snip-123.jpg');
  });

  it('never leaves a dangling temp file reference when the crop itself fails', async () => {
    cropPageRegion.mockRejectedValue(new Error('Region crop timed out'));
    const { POST } = await import('./route');
    const response = (await POST(post({ x: 10, y: 20, width: 300, height: 120 }), { params: params('12') })) as Response;

    expect(response.status).toBe(500);
    expect(unlink).not.toHaveBeenCalled();
  });
});
