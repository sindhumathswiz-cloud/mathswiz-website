import { beforeEach, describe, expect, it, vi } from 'vitest';

const getAuthenticatedUser = vi.fn();
const recordAuditLog = vi.fn();

const bookIngestionRun = { findFirst: vi.fn() };
const question = { updateMany: vi.fn() };

vi.mock('@/lib/auth-server', () => ({ getAuthenticatedUser }));
vi.mock('@/lib/prisma', () => ({ default: { bookIngestionRun, question } }));
vi.mock('@/lib/audit-log', () => ({ recordAuditLog, requestAuditContext: () => ({}) }));

function post() {
  return new Request('http://localhost/api/admin/books/book-1/ingestions/run-1/clear-printed-numbers', { method: 'POST' });
}

const params = Promise.resolve({ id: 'book-1', runId: 'run-1' });

describe('POST /api/admin/books/[id]/ingestions/[runId]/clear-printed-numbers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getAuthenticatedUser.mockResolvedValue({ user: { id: 'admin-1', role: 'ADMIN' } });
    bookIngestionRun.findFirst.mockResolvedValue({ id: 'run-1' });
  });

  it('rejects non-admin callers', async () => {
    getAuthenticatedUser.mockResolvedValue({ error: new Response(null, { status: 403 }) });
    const { POST } = await import('./route');
    const response = (await POST(post(), { params })) as Response;
    expect(response.status).toBe(403);
    expect(question.updateMany).not.toHaveBeenCalled();
  });

  it('404s when the ingestion run is not found', async () => {
    bookIngestionRun.findFirst.mockResolvedValue(null);
    const { POST } = await import('./route');
    const response = (await POST(post(), { params })) as Response;
    expect(response.status).toBe(404);
    expect(question.updateMany).not.toHaveBeenCalled();
  });

  it('clears printedNumber only on DRAFT questions in this book, reports the count, and audits', async () => {
    question.updateMany.mockResolvedValue({ count: 37 });
    const { POST } = await import('./route');
    const response = (await POST(post(), { params })) as Response;
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(question.updateMany).toHaveBeenCalledWith({
      where: { bookId: 'book-1', status: 'DRAFT', printedNumber: { not: null } },
      data: { printedNumber: null },
    });
    expect(data.printedNumbersCleared).toBe(37);
    expect(recordAuditLog).toHaveBeenCalledWith(expect.objectContaining({
      action: 'BOOK_PRINTED_NUMBERS_CLEARED',
      metadata: expect.objectContaining({ bookId: 'book-1', printedNumbersCleared: 37 }),
    }));
  });
});
