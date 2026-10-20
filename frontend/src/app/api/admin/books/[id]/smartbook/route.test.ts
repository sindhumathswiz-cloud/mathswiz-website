// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

const getAuthenticatedUser = vi.fn();
const recordAuditLog = vi.fn();
const book = { findUnique: vi.fn(), update: vi.fn() };
const documentPage = { count: vi.fn() };

vi.mock('@/lib/auth-server', () => ({ getAuthenticatedUser }));
vi.mock('@/lib/audit-log', () => ({ recordAuditLog, requestAuditContext: () => ({}) }));
vi.mock('@/lib/prisma', () => ({ default: { book, documentPage } }));

const call = async (body: unknown) => {
  const { POST } = await import('./route');
  return (await POST(new Request('http://localhost/api/admin/books/b1/smartbook', { method: 'POST', body: JSON.stringify(body) }), { params: Promise.resolve({ id: 'b1' }) })) as Response;
};

describe('POST /api/admin/books/[id]/smartbook', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getAuthenticatedUser.mockResolvedValue({ user: { id: 'admin-1' } });
    book.findUnique.mockResolvedValue({ id: 'b1', title: 'Xam Idea', ingestionRuns: [{ sourceDocumentId: 'doc-1', draftPurgedAt: null }] });
    book.update.mockImplementation(async ({ data }) => ({ id: 'b1', smartbookPublishedAt: data.smartbookPublishedAt }));
    documentPage.count.mockResolvedValue(534);
  });

  it('publishes a rendered book and records it', async () => {
    const res = await call({ publish: true });
    expect(res.status).toBe(200);
    expect(book.update.mock.calls[0][0].data.smartbookPublishedAt).toBeInstanceOf(Date);
    expect(recordAuditLog).toHaveBeenCalledWith(expect.objectContaining({ action: 'BOOK_SMARTBOOK_PUBLISHED', entityId: 'b1' }));
  });

  it('withdraws a book', async () => {
    const res = await call({ publish: false });
    expect(res.status).toBe(200);
    expect(book.update.mock.calls[0][0].data).toEqual({ smartbookPublishedAt: null });
  });

  it('refuses a book whose pages are gone or were never rendered', async () => {
    book.findUnique.mockResolvedValue({ id: 'b1', title: 'X', ingestionRuns: [{ sourceDocumentId: 'doc-1', draftPurgedAt: new Date() }] });
    expect((await call({ publish: true })).status).toBe(409);
    book.findUnique.mockResolvedValue({ id: 'b1', title: 'X', ingestionRuns: [] });
    expect((await call({ publish: true })).status).toBe(409);
    book.findUnique.mockResolvedValue({ id: 'b1', title: 'X', ingestionRuns: [{ sourceDocumentId: 'doc-1', draftPurgedAt: null }] });
    documentPage.count.mockResolvedValue(0);
    expect((await call({ publish: true })).status).toBe(409);
    expect(book.update).not.toHaveBeenCalled();
  });

  it('needs an explicit choice', async () => {
    expect((await call({ publish: 'yes' })).status).toBe(400);
  });
});
