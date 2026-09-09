import { beforeEach, describe, expect, it, vi } from 'vitest';

const getAuthenticatedUser = vi.fn();
const bookIngestionRun = { findFirst: vi.fn() };
const readFile = vi.fn();
const assertPrivatePageImagePath = vi.fn((p: string) => p);
const privateQuestionImageDirectory = vi.fn((bookId: string, runId: string) => `/private/${bookId}/runs/${runId}/question-images`);

vi.mock('@/lib/auth-server', () => ({ getAuthenticatedUser }));
vi.mock('@/lib/prisma', () => ({ default: { bookIngestionRun } }));
// Vitest 4 checks a mocked built-in module's shape against the real one —
// node:fs/promises' ESM interop shim exposes a `default` (the same methods
// as one object) alongside the named exports, so the mock needs both or
// Vitest rejects it with "No 'default' export is defined on the mock."
vi.mock('node:fs/promises', () => ({ readFile, default: { readFile } }));
vi.mock('@/lib/book-storage', () => ({ assertPrivatePageImagePath, privateQuestionImageDirectory }));

const params = (path: string[]) => Promise.resolve({ id: 'book-1', runId: 'run-1', path });

describe('GET /api/admin/books/[id]/ingestions/[runId]/question-images/[...path]', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getAuthenticatedUser.mockResolvedValue({ user: { id: 'admin-1', role: 'ADMIN' } });
    bookIngestionRun.findFirst.mockResolvedValue({ id: 'run-1' });
    assertPrivatePageImagePath.mockImplementation((p: string) => p);
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
    expect(readFile).not.toHaveBeenCalled();
  });

  it('rejects a path validation failure (e.g. traversal) without reading the file', async () => {
    assertPrivatePageImagePath.mockImplementation(() => { throw new Error('Invalid private page image path'); });
    const { GET } = await import('./route');
    const response = (await GET(new Request('http://localhost'), { params: params(['secret.jpg']) })) as Response;
    expect(response.status).toBe(400);
    expect(readFile).not.toHaveBeenCalled();
  });

  it('streams the cropped image with the right content type', async () => {
    readFile.mockResolvedValue(Buffer.from('fake-jpeg-bytes'));
    const { GET } = await import('./route');
    const response = (await GET(new Request('http://localhost'), { params: params(['q-1-0.jpg']) })) as Response;

    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toBe('image/jpeg');
    expect(privateQuestionImageDirectory).toHaveBeenCalledWith('book-1', 'run-1');
  });

  it('returns 404 when the file is missing', async () => {
    readFile.mockRejectedValue(new Error('ENOENT'));
    const { GET } = await import('./route');
    const response = (await GET(new Request('http://localhost'), { params: params(['missing.jpg']) })) as Response;
    expect(response.status).toBe(404);
  });
});
