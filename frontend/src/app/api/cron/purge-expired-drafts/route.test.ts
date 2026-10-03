import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const purgeExpiredDrafts = vi.fn();
const recordAuditLog = vi.fn();
vi.mock('@/lib/draft-retention', () => ({ purgeExpiredDrafts }));
vi.mock('@/lib/audit-log', () => ({ recordAuditLog }));

const call = async (authorization?: string) => {
  const { GET } = await import('./route');
  return await GET(new Request('http://localhost/api/cron/purge-expired-drafts', { headers: authorization ? { authorization } : {} })) as Response;
};

describe('/api/cron/purge-expired-drafts', () => {
  const original = process.env.CRON_SECRET;
  beforeEach(() => {
    vi.clearAllMocks();
    purgeExpiredDrafts.mockResolvedValue({ dryRun: false, due: [], purged: [] });
  });
  afterEach(() => {
    if (original === undefined) delete process.env.CRON_SECRET; else process.env.CRON_SECRET = original;
  });

  it('fails closed when no secret is configured, even for a request that sends a bearer token', async () => {
    delete process.env.CRON_SECRET;
    expect((await call('Bearer anything')).status).toBe(401);
    expect((await call('Bearer ')).status).toBe(401);
    expect(purgeExpiredDrafts).not.toHaveBeenCalled();
  });

  it('rejects a missing or wrong secret without purging anything', async () => {
    process.env.CRON_SECRET = 'correct-horse';
    expect((await call()).status).toBe(401);
    expect((await call('Bearer wrong')).status).toBe(401);
    expect((await call('correct-horse')).status).toBe(401);
    expect(purgeExpiredDrafts).not.toHaveBeenCalled();
  });

  it('purges and audits as the system when the secret matches', async () => {
    process.env.CRON_SECRET = 'correct-horse';
    purgeExpiredDrafts.mockResolvedValue({ dryRun: false, due: [], purged: [{ runId: 'run-1', bookTitle: 'Calculus', pagesCleared: 10, filesRemoved: 10, fileErrors: 0, benchmarksRemoved: 0 }] });
    const response = await call('Bearer correct-horse');
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ purged: 1 });
    expect(recordAuditLog).toHaveBeenCalledWith(expect.objectContaining({ action: 'BOOK_DRAFTS_PURGED', actorRole: 'SYSTEM', actorId: null }));
  });

  it('writes no audit entry on a sweep that purged nothing', async () => {
    process.env.CRON_SECRET = 'correct-horse';
    await call('Bearer correct-horse');
    expect(recordAuditLog).not.toHaveBeenCalled();
  });
});
