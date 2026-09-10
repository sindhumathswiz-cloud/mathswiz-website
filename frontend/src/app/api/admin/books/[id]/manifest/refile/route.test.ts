import { beforeEach, describe, expect, it, vi } from 'vitest';

const getAuthenticatedUser = vi.fn();
const recordAuditLog = vi.fn();
const loadConfirmedChapters = vi.fn();
const book = { findUnique: vi.fn() };
const question = { updateMany: vi.fn() };

vi.mock('@/lib/auth-server', () => ({ getAuthenticatedUser }));
vi.mock('@/lib/prisma', () => ({ default: { book, question } }));
vi.mock('@/lib/audit-log', () => ({ recordAuditLog, requestAuditContext: () => ({}) }));
vi.mock('@/lib/book-manifest', () => ({ loadConfirmedChapters }));

const params = Promise.resolve({ id: 'book-1' });
const req = () => new Request('http://localhost/api/admin/books/book-1/manifest/refile', { method: 'POST' });

describe('POST /api/admin/books/[id]/manifest/refile', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getAuthenticatedUser.mockResolvedValue({ user: { id: 'admin-1', role: 'ADMIN' } });
    book.findUnique.mockResolvedValue({ id: 'book-1' });
  });

  it('409s when no chapter is confirmed', async () => {
    loadConfirmedChapters.mockResolvedValue([]);
    const { POST } = await import('./route');
    expect((await POST(req(), { params }) as Response).status).toBe(409);
  });

  it('re-files DRAFT questions to each confirmed chapter by source-page range', async () => {
    loadConfirmedChapters.mockResolvedValue([
      { id: 'ch1', name: 'Vector Algebra', topic: 'Vector Algebra', startPage: 100, endPage: 130 },
      { id: 'ch2', name: 'Probability', topic: null, startPage: 131, endPage: 160 },
    ]);
    question.updateMany.mockResolvedValueOnce({ count: 40 }).mockResolvedValueOnce({ count: 55 });

    const { POST } = await import('./route');
    const data = await (await POST(req(), { params }) as Response).json();

    expect(question.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ bookId: 'book-1', status: 'DRAFT', sourcePageStart: { gte: 100, lte: 130 }, NOT: { bookChapterId: 'ch1' } }),
      data: { bookChapterId: 'ch1', topic: 'Vector Algebra' },
    }));
    expect(question.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      data: { bookChapterId: 'ch2', topic: 'Probability' }, // falls back to name when topic is null
    }));
    expect(data.total).toBe(95);
    expect(recordAuditLog).toHaveBeenCalledWith(expect.objectContaining({ action: 'BOOK_QUESTIONS_REFILED' }));
  });
});
