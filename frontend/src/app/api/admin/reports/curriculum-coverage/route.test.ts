import { beforeEach, describe, expect, it, vi } from 'vitest';

const getAuthenticatedUser = vi.fn();
vi.mock('@/lib/auth-server', () => ({ getAuthenticatedUser }));

const crossBookReconciliationSummary = vi.fn();
vi.mock('@/lib/exercise-reconciliation', () => ({ crossBookReconciliationSummary }));

describe('GET /api/admin/reports/curriculum-coverage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getAuthenticatedUser.mockResolvedValue({ user: { id: 'admin-1', role: 'ADMIN' } });
    crossBookReconciliationSummary.mockResolvedValue({ books: [], platform: { exerciseCount: 0 } });
  });

  it('rejects non-admin callers', async () => {
    getAuthenticatedUser.mockResolvedValue({ error: new Response(null, { status: 403 }) });
    const { GET } = await import('./route');
    const response = (await GET()) as Response;
    expect(response.status).toBe(403);
    expect(crossBookReconciliationSummary).not.toHaveBeenCalled();
  });

  it('returns the cross-book summary as-is', async () => {
    crossBookReconciliationSummary.mockResolvedValue({
      books: [{ bookId: 'book-1', bookTitle: 'RS Aggarwal', className: 'Class 11', subject: 'Mathematics', exerciseCount: 5, discrepantCount: 1, totalExpected: 50, totalExtracted: 48, totalMatched: 45, totalUnresolved: 3 }],
      platform: { exerciseCount: 5, discrepantCount: 1, totalExpected: 50, totalExtracted: 48, totalMatched: 45, totalUnresolved: 3 },
    });
    const { GET } = await import('./route');
    const body = await ((await GET()) as Response).json();
    expect(body.books).toHaveLength(1);
    expect(body.platform.totalUnresolved).toBe(3);
  });
});
