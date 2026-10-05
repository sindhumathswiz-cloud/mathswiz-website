import { beforeEach, describe, expect, it, vi } from 'vitest';

const getAuthenticatedUser = vi.fn();
const recordAuditLog = vi.fn();
const bookChapter = { findFirst: vi.fn() };
const revisionItem = { updateMany: vi.fn(), count: vi.fn() };

vi.mock('@/lib/auth-server', () => ({ getAuthenticatedUser }));
vi.mock('@/lib/audit-log', () => ({ recordAuditLog, requestAuditContext: () => ({}) }));
vi.mock('@/lib/prisma', () => ({ default: { bookChapter, revisionItem } }));

const params = () => Promise.resolve({ id: 'book-1' });
const post = async (body: unknown) => { const { POST } = await import('./route'); return await POST(new Request('http://localhost/x', { method: 'POST', body: JSON.stringify(body) }), { params: params() }) as Response; };

describe('POST /api/admin/books/[id]/revision-content/approve', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getAuthenticatedUser.mockResolvedValue({ user: { id: 'admin-1', role: 'ADMIN' } });
    bookChapter.findFirst.mockResolvedValue({ id: 'ch-1' });
    revisionItem.updateMany.mockResolvedValue({ count: 7 });
    revisionItem.count.mockResolvedValue(3);
  });

  it('rejects non-admins and unknown chapters', async () => {
    getAuthenticatedUser.mockResolvedValueOnce({ error: new Response(null, { status: 403 }) });
    expect((await post({ chapterId: 'ch-1' })).status).toBe(403);
    bookChapter.findFirst.mockResolvedValueOnce(null);
    expect((await post({ chapterId: 'nope' })).status).toBe(404);
    expect(revisionItem.updateMany).not.toHaveBeenCalled();
  });

  it('approves only DRAFT items that matched their page exactly with nothing flagged, and says how many still need a look', async () => {
    const data = await (await post({ chapterId: 'ch-1' })).json();
    const call = revisionItem.updateMany.mock.calls[0][0];
    expect(call.where).toEqual({ bookId: 'book-1', chapterId: 'ch-1', status: 'DRAFT', verbatimScore: 1, reviewNotes: null });
    expect(call.data).toMatchObject({ status: 'APPROVED', reviewedById: 'admin-1' });
    expect(data).toEqual({ approved: 7, remainingForReview: 3 });
    expect(recordAuditLog).toHaveBeenCalledWith(expect.objectContaining({ action: 'BOOK_REVISION_CONTENT_APPROVED' }));
  });
});
