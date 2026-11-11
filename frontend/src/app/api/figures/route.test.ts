// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

const getAuthenticatedUser = vi.fn();
const displayableFigures = vi.fn();
const figureFile = vi.fn();
const readPrivateImage = vi.fn();
vi.mock('@/lib/auth-server', () => ({ getAuthenticatedUser }));
vi.mock('@/lib/figure-display', () => ({ displayableFigures, figureFile }));
vi.mock('@/lib/book-storage', () => ({ privateImageReference: (b: string, r: string, d: string, f: string) => `/private/${b}/${r}/${d}/${f}`, readPrivateImage }));

describe('GET /api/figures', () => {
  beforeEach(() => vi.clearAllMocks());

  it('needs a signed-in user', async () => {
    getAuthenticatedUser.mockResolvedValue({ error: new Response(null, { status: 401 }) });
    const { GET } = await import('./route');
    expect((await GET(new Request('http://x/api/figures?questionIds=q1')))!.status).toBe(401);
  });

  it('returns the figures for the questions asked about; unapproved ones only for an admin', async () => {
    getAuthenticatedUser.mockResolvedValue({ user: { id: 's1', role: 'STUDENT' } });
    displayableFigures.mockResolvedValue({ q1: [{ url: '/api/figures/page/f1', caption: null }] });
    const { GET } = await import('./route');
    const data = await (await GET(new Request('http://x/api/figures?questionIds=q1,%20q2,')))!.json();
    expect(data.figures.q1).toHaveLength(1);
    expect(displayableFigures).toHaveBeenCalledWith(['q1', 'q2'], { includeUnapproved: false });
    getAuthenticatedUser.mockResolvedValue({ user: { id: 'a1', role: 'ADMIN' } });
    await GET(new Request('http://x/api/figures?questionIds=q3'));
    expect(displayableFigures).toHaveBeenLastCalledWith(['q3'], { includeUnapproved: true });
  });
});

describe('GET /api/figures/[kind]/[id]', () => {
  beforeEach(() => vi.clearAllMocks());

  it('streams a figure its question allows, and 404s anything else', async () => {
    getAuthenticatedUser.mockResolvedValue({ user: { id: 's1', role: 'STUDENT' } });
    figureFile.mockResolvedValue({ bookId: 'b1', runId: 'r1', fileName: 'pf-0.jpg' });
    readPrivateImage.mockResolvedValue(Buffer.from([1, 2, 3]));
    const { GET } = await import('./[kind]/[id]/route');
    const res = (await GET(new Request('http://x'), { params: Promise.resolve({ kind: 'page', id: 'f1' }) }))!;
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toBe('image/jpeg');
    expect(readPrivateImage).toHaveBeenCalledWith('/private/b1/r1/question-images/pf-0.jpg');
    expect(figureFile).toHaveBeenCalledWith('page', 'f1', { includeUnapproved: false });

    figureFile.mockResolvedValue(null);
    expect((await GET(new Request('http://x'), { params: Promise.resolve({ kind: 'page', id: 'f2' }) }))!.status).toBe(404);
    expect((await GET(new Request('http://x'), { params: Promise.resolve({ kind: 'other', id: 'f1' }) }))!.status).toBe(404);
  });
});
