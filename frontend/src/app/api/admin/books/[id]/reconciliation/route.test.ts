import { beforeEach, describe, expect, it, vi } from 'vitest';

const getAuthenticatedUser = vi.fn();
vi.mock('@/lib/auth-server', () => ({ getAuthenticatedUser }));

const recordAuditLog = vi.fn();
vi.mock('@/lib/audit-log', () => ({ recordAuditLog, requestAuditContext: () => ({}) }));

const mockPrisma = { book: { findUnique: vi.fn() }, bookExercise: { findFirst: vi.fn(), update: vi.fn() } };
vi.mock('@/lib/prisma', () => ({ default: mockPrisma }));

const bookReconciliationReport = vi.fn();
const reconcileBook = vi.fn();
vi.mock('@/lib/exercise-reconciliation', () => ({ bookReconciliationReport, reconcileBook }));

function get() {
  return new Request('http://localhost/api/admin/books/book-1/reconciliation');
}
function post() {
  return new Request('http://localhost/api/admin/books/book-1/reconciliation', { method: 'POST' });
}
function patch(body: unknown) {
  return new Request('http://localhost/api/admin/books/book-1/reconciliation', { method: 'PATCH', body: JSON.stringify(body) });
}
const params = Promise.resolve({ id: 'book-1' });

const cleanRow = { exerciseId: 'ex-1', extractedQuestionCount: 10, matchedQuestionCount: 10, unresolvedQuestionCount: 0, expectedQuestionCount: 10, discrepancies: [] };
const dirtyRow = { exerciseId: 'ex-2', extractedQuestionCount: 5, matchedQuestionCount: 3, unresolvedQuestionCount: 2, expectedQuestionCount: 8, discrepancies: ['2 extracted question(s) still missing an answer or solution', 'expected 8 question(s), only 5 extracted'] };

describe('/api/admin/books/[id]/reconciliation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getAuthenticatedUser.mockResolvedValue({ user: { id: 'admin-1', role: 'ADMIN' } });
    mockPrisma.book.findUnique.mockResolvedValue({ id: 'book-1' });
  });

  describe('GET', () => {
    it('404s when the book does not exist', async () => {
      mockPrisma.book.findUnique.mockResolvedValue(null);
      const { GET } = await import('./route');
      const response = await GET(get(), { params }) as Response;
      expect(response.status).toBe(404);
    });

    it('returns the stored report with a rolled-up summary, without recomputing', async () => {
      bookReconciliationReport.mockResolvedValue([cleanRow, dirtyRow]);
      const { GET } = await import('./route');
      const response = await GET(get(), { params }) as Response;
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(reconcileBook).not.toHaveBeenCalled();
      expect(data.exercises).toHaveLength(2);
      expect(data.summary).toMatchObject({ exerciseCount: 2, discrepantCount: 1, totalExtracted: 15, totalMatched: 13, totalUnresolved: 2 });
    });
  });

  describe('POST', () => {
    it('recomputes via reconcileBook and audit-logs the summary', async () => {
      reconcileBook.mockResolvedValue([cleanRow]);
      const { POST } = await import('./route');
      const response = await POST(post(), { params }) as Response;
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(reconcileBook).toHaveBeenCalledWith('book-1');
      expect(data.summary.discrepantCount).toBe(0);
      expect(recordAuditLog).toHaveBeenCalledWith(expect.objectContaining({ action: 'BOOK_RECONCILED' }));
    });
  });

  describe('PATCH', () => {
    it('requires exerciseId', async () => {
      const { PATCH } = await import('./route');
      const response = await PATCH(patch({ expectedQuestionCount: 5 }), { params }) as Response;
      expect(response.status).toBe(400);
    });

    it('rejects a non-integer, non-null expectedQuestionCount', async () => {
      const { PATCH } = await import('./route');
      const response = await PATCH(patch({ exerciseId: 'ex-1', expectedQuestionCount: 'ten' }), { params }) as Response;
      expect(response.status).toBe(400);
    });

    it('404s when the exercise does not belong to this book', async () => {
      mockPrisma.bookExercise.findFirst.mockResolvedValue(null);
      const { PATCH } = await import('./route');
      const response = await PATCH(patch({ exerciseId: 'ex-1', expectedQuestionCount: 5 }), { params }) as Response;
      expect(response.status).toBe(404);
      expect(mockPrisma.bookExercise.update).not.toHaveBeenCalled();
    });

    it('sets expectedQuestionCount and returns the refreshed report', async () => {
      mockPrisma.bookExercise.findFirst.mockResolvedValue({ id: 'ex-1' });
      bookReconciliationReport.mockResolvedValue([cleanRow]);
      const { PATCH } = await import('./route');
      const response = await PATCH(patch({ exerciseId: 'ex-1', expectedQuestionCount: 12 }), { params }) as Response;
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(mockPrisma.bookExercise.update).toHaveBeenCalledWith({ where: { id: 'ex-1' }, data: { expectedQuestionCount: 12 } });
      expect(data.exercises).toEqual([cleanRow]);
    });

    it('allows clearing expectedQuestionCount back to null', async () => {
      mockPrisma.bookExercise.findFirst.mockResolvedValue({ id: 'ex-1' });
      bookReconciliationReport.mockResolvedValue([]);
      const { PATCH } = await import('./route');
      const response = await PATCH(patch({ exerciseId: 'ex-1', expectedQuestionCount: null }), { params }) as Response;

      expect(response.status).toBe(200);
      expect(mockPrisma.bookExercise.update).toHaveBeenCalledWith({ where: { id: 'ex-1' }, data: { expectedQuestionCount: null } });
    });
  });
});
