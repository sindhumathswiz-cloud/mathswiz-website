import { beforeEach, describe, expect, it, vi } from 'vitest';

const getAuthenticatedUser = vi.fn();
const recordAuditLog = vi.fn();
const question = { findUnique: vi.fn(), update: vi.fn() };

vi.mock('@/lib/auth-server', () => ({ getAuthenticatedUser }));
vi.mock('@/lib/prisma', () => ({ default: { question } }));
vi.mock('@/lib/audit-log', () => ({ recordAuditLog, requestAuditContext: () => ({}) }));

function patch(body: unknown) {
  return new Request('http://localhost/api/admin/questions/q-1/resolve-flag', {
    method: 'PATCH',
    body: JSON.stringify(body),
  });
}

const params = Promise.resolve({ id: 'q-1' });

describe('PATCH /api/admin/questions/[id]/resolve-flag', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getAuthenticatedUser.mockResolvedValue({ user: { id: 'admin-1', email: 'sindhu.mathswiz@gmail.com', role: 'ADMIN' } });
  });

  it('rejects non-admin callers', async () => {
    getAuthenticatedUser.mockResolvedValue({ error: new Response(null, { status: 403 }) });
    const { PATCH } = await import('./route');
    const response = (await PATCH(patch({ action: 'resolve' }), { params })) as Response;
    expect(response.status).toBe(403);
  });

  it('rejects a body whose action is not "resolve"', async () => {
    const { PATCH } = await import('./route');
    const response = (await PATCH(patch({ action: 'archive' }), { params })) as Response;
    expect(response.status).toBe(400);
    expect(question.update).not.toHaveBeenCalled();
  });

  it('404s when the question is not found', async () => {
    question.findUnique.mockResolvedValue(null);
    const { PATCH } = await import('./route');
    const response = (await PATCH(patch({ action: 'resolve' }), { params })) as Response;
    expect(response.status).toBe(404);
  });

  it('strips the review-flag tags, sets VERIFIED, appends a resolved note, and audits', async () => {
    question.findUnique.mockResolvedValue({ tags: ['Second-Review: Flagged', 'AI-Verified: Flagged', 'Some Other Tag'], reviewNotes: 'existing note' });
    question.update.mockResolvedValue({ id: 'q-1', verificationStatus: 'VERIFIED', tags: ['Some Other Tag'], reviewNotes: 'existing note\n\n[Resolved...]' });

    const { PATCH } = await import('./route');
    await PATCH(patch({ action: 'resolve' }), { params });

    expect(question.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'q-1' },
      data: expect.objectContaining({
        tags: ['Some Other Tag'],
        verificationStatus: 'VERIFIED',
        reviewNotes: expect.stringContaining('existing note'),
      }),
    }));
    expect(recordAuditLog).toHaveBeenCalledWith(expect.objectContaining({ action: 'QUESTION_REVIEW_RESOLVED', entityType: 'Question', entityId: 'q-1' }));
  });

  it('never hard-deletes -- only tags/status/reviewNotes are written', async () => {
    question.findUnique.mockResolvedValue({ tags: ['Second-Review: Flagged'], reviewNotes: null });
    question.update.mockResolvedValue({ id: 'q-1', verificationStatus: 'VERIFIED', tags: [], reviewNotes: 'note' });

    const { PATCH } = await import('./route');
    await PATCH(patch({ action: 'resolve' }), { params });

    const call = question.update.mock.calls[0][0];
    expect(Object.keys(call.data).sort()).toEqual(['reviewNotes', 'tags', 'verificationStatus']);
  });
});
