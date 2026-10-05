import { beforeEach, describe, expect, it, vi } from 'vitest';

const getAuthenticatedUser = vi.fn();
const recordAuditLog = vi.fn();
const bookIngestionRun = { findFirst: vi.fn(), update: vi.fn() };

vi.mock('@/lib/auth-server', () => ({ getAuthenticatedUser }));
vi.mock('@/lib/audit-log', () => ({ recordAuditLog, requestAuditContext: () => ({}) }));
vi.mock('@/lib/prisma', () => ({ default: { bookIngestionRun } }));
const params = () => Promise.resolve({ id: 'book-1', runId: 'run-1' });
const put = async (body: unknown) => { const { PUT } = await import('./route'); return await PUT(new Request('http://localhost/x', { method: 'PUT', body: JSON.stringify(body) }), { params: params() }) as Response; };

describe('PUT /api/admin/books/[id]/ingestions/[runId]/pilot-measurements', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getAuthenticatedUser.mockResolvedValue({ user: { id: 'admin-1', role: 'ADMIN' } });
    bookIngestionRun.findFirst.mockResolvedValue({ id: 'run-1', providerConfig: { sourceProfile: 'IMAGE_BOOK', pendingCaseStudyFragment: { startPage: 3 } } });
    bookIngestionRun.update.mockResolvedValue({});
  });

  it('rejects non-admins and unknown runs', async () => {
    getAuthenticatedUser.mockResolvedValueOnce({ error: new Response(null, { status: 403 }) });
    expect((await put({ spend: 10 })).status).toBe(403);
    bookIngestionRun.findFirst.mockResolvedValueOnce(null);
    expect((await put({ spend: 10 })).status).toBe(404);
    expect(bookIngestionRun.update).not.toHaveBeenCalled();
  });

  it('rejects negative, non-numeric, fractional-count and malformed values', async () => {
    expect((await put({ spend: -5 })).status).toBe(400);
    expect((await put({ reviewMinutes: 'ninety' })).status).toBe(400);
    expect((await put({ reviewedQuestions: 12.5 })).status).toBe(400);
    expect((await put({ currency: 'rupees' })).status).toBe(400);
    expect((await put({ spend: 1e12 })).status).toBe(400);
    expect(bookIngestionRun.update).not.toHaveBeenCalled();
  });

  it('merges into the run config instead of replacing it, so extraction state survives', async () => {
    const response = await put({ reviewMinutes: 95, reviewedQuestions: 120, spend: 340, currency: 'inr', notes: ' first pass ' });
    expect(response.status).toBe(200);
    const saved = bookIngestionRun.update.mock.calls[0][0].data.providerConfig;
    expect(saved.sourceProfile).toBe('IMAGE_BOOK');
    expect(saved.pendingCaseStudyFragment).toEqual({ startPage: 3 });
    expect(saved.pilot).toMatchObject({ reviewMinutes: 95, reviewedQuestions: 120, spend: 340, currency: 'INR', notes: 'first pass', updatedById: 'admin-1' });
    expect(recordAuditLog).toHaveBeenCalledWith(expect.objectContaining({ action: 'BOOK_PILOT_MEASUREMENTS_RECORDED' }));
  });

  it('keeps fields that are left out, and clears one sent as null', async () => {
    bookIngestionRun.findFirst.mockResolvedValue({ id: 'run-1', providerConfig: { pilot: { reviewMinutes: 60, reviewedQuestions: 40, spend: 100, currency: 'INR', notes: 'keep me' } } });
    await put({ spend: 150, reviewMinutes: null });
    const saved = bookIngestionRun.update.mock.calls[0][0].data.providerConfig.pilot;
    expect(saved).toMatchObject({ spend: 150, reviewMinutes: null, reviewedQuestions: 40, currency: 'INR', notes: 'keep me' });
  });
});
