import { beforeEach, describe, expect, it, vi } from 'vitest';

const getAuthenticatedUser = vi.fn();
vi.mock('@/lib/auth-server', () => ({ getAuthenticatedUser }));

const recordAuditLog = vi.fn();
vi.mock('@/lib/audit-log', () => ({ recordAuditLog, requestAuditContext: () => ({}) }));

const mockPrisma = {
  bookIngestionRun: { findFirst: vi.fn(), update: vi.fn() },
  bookChapter: { count: vi.fn() },
};
vi.mock('@/lib/prisma', () => ({ default: mockPrisma }));

const reconcileBook = vi.fn();
vi.mock('@/lib/exercise-reconciliation', () => ({ reconcileBook }));

function post() {
  return new Request('http://localhost/api/admin/books/book-1/ingestions/run-1/complete', { method: 'POST' });
}
const params = Promise.resolve({ id: 'book-1', runId: 'run-1' });

// bookChapter.count is called twice per request -- once with no confirmation
// filter (totalChapters) and once filtered to manifestConfirmedAt: null
// (unconfirmedChapters) -- keyed on the `where` shape rather than call order
// so it stays correct regardless of how the route sequences the two calls.
function mockChapterCounts(total: number, unconfirmed: number) {
  mockPrisma.bookChapter.count.mockImplementation(({ where }: any) =>
    Promise.resolve('manifestConfirmedAt' in where ? unconfirmed : total));
}

describe('POST /api/admin/books/[id]/ingestions/[runId]/complete', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getAuthenticatedUser.mockResolvedValue({ user: { id: 'admin-1', role: 'ADMIN' } });
    mockChapterCounts(3, 0); // a normal, fully-confirmed book by default
  });

  it('rejects non-admin callers', async () => {
    getAuthenticatedUser.mockResolvedValue({ error: new Response(null, { status: 403 }) });
    const { POST } = await import('./route');
    const response = await POST(post(), { params }) as Response;
    expect(response.status).toBe(403);
  });

  it('404s when the run does not belong to the book', async () => {
    mockPrisma.bookIngestionRun.findFirst.mockResolvedValue(null);
    const { POST } = await import('./route');
    const response = await POST(post(), { params }) as Response;
    expect(response.status).toBe(404);
  });

  it('is idempotent: a run already COMPLETED reports success without re-reconciling', async () => {
    mockPrisma.bookIngestionRun.findFirst.mockResolvedValue({ id: 'run-1', stage: 'COMPLETED', completedAt: new Date() });
    const { POST } = await import('./route');
    const response = await POST(post(), { params }) as Response;
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.alreadyComplete).toBe(true);
    expect(reconcileBook).not.toHaveBeenCalled();
    expect(mockPrisma.bookIngestionRun.update).not.toHaveBeenCalled();
  });

  it('refuses when the book has no chapters at all', async () => {
    mockPrisma.bookIngestionRun.findFirst.mockResolvedValue({ id: 'run-1', stage: 'REVIEW_READY', completedAt: null });
    mockChapterCounts(0, 0);
    const { POST } = await import('./route');
    const response = await POST(post(), { params }) as Response;
    expect(response.status).toBe(409);
    expect(reconcileBook).not.toHaveBeenCalled();
  });

  it('refuses when any chapter manifest is not yet confirmed', async () => {
    mockPrisma.bookIngestionRun.findFirst.mockResolvedValue({ id: 'run-1', stage: 'REVIEW_READY', completedAt: null });
    mockChapterCounts(3, 2);
    const { POST } = await import('./route');
    const response = await POST(post(), { params }) as Response;
    const data = await response.json();

    expect(response.status).toBe(409);
    expect(data.unconfirmedChapters).toBe(2);
    expect(reconcileBook).not.toHaveBeenCalled();
    expect(mockPrisma.bookIngestionRun.update).not.toHaveBeenCalled();
  });

  it('refuses when reconciliation finds zero question-bearing exercises to check against', async () => {
    mockPrisma.bookIngestionRun.findFirst.mockResolvedValue({ id: 'run-1', stage: 'REVIEW_READY', completedAt: null });
    reconcileBook.mockResolvedValue([]);
    const { POST } = await import('./route');
    const response = await POST(post(), { params }) as Response;
    const data = await response.json();

    expect(response.status).toBe(409);
    expect(data.error).toContain('No confirmed, question-bearing exercise');
    expect(mockPrisma.bookIngestionRun.update).not.toHaveBeenCalled();
  });

  it('refuses and leaves discrepant exercises in review when reconciliation finds a gap', async () => {
    mockPrisma.bookIngestionRun.findFirst.mockResolvedValue({ id: 'run-1', stage: 'REVIEW_READY', completedAt: null });
    reconcileBook.mockResolvedValue([
      { exerciseId: 'ex-1', discrepancies: [] },
      { exerciseId: 'ex-2', discrepancies: ['expected 10 question(s), only 7 extracted'] },
    ]);
    const { POST } = await import('./route');
    const response = await POST(post(), { params }) as Response;
    const data = await response.json();

    expect(response.status).toBe(409);
    expect(data.discrepancies).toHaveLength(1);
    expect(data.discrepancies[0].exerciseId).toBe('ex-2');
    expect(mockPrisma.bookIngestionRun.update).not.toHaveBeenCalled();
  });

  it('marks the run COMPLETED when every confirmed exercise reconciles clean', async () => {
    mockPrisma.bookIngestionRun.findFirst.mockResolvedValue({ id: 'run-1', stage: 'REVIEW_READY', completedAt: null });
    reconcileBook.mockResolvedValue([{ exerciseId: 'ex-1', discrepancies: [] }]);
    mockPrisma.bookIngestionRun.update.mockResolvedValue({ stage: 'COMPLETED', completedAt: new Date('2026-09-21') });
    const { POST } = await import('./route');
    const response = await POST(post(), { params }) as Response;
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.stage).toBe('COMPLETED');
    expect(mockPrisma.bookIngestionRun.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'run-1' },
      data: expect.objectContaining({ stage: 'COMPLETED' }),
    }));
    expect(recordAuditLog).toHaveBeenCalledWith(expect.objectContaining({ action: 'BOOK_INGESTION_COMPLETED' }));
  });
});
