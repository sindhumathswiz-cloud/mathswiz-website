// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const getServerSession = vi.fn();
const runContentSync = vi.fn();
const resolveConflict = vi.fn();
const contentSyncRun = { findMany: vi.fn() };

vi.mock('next-auth', () => ({ getServerSession }));
vi.mock('@/lib/auth', () => ({ authOptions: {} }));
vi.mock('@/lib/prisma', () => ({ default: { contentSyncRun } }));
vi.mock('@/lib/content-sync/run', () => ({ runContentSync, resolveConflict }));

const STAGING = 'postgresql://postgres.stagingref:pw@aws-0-ap-south-1.pooler.supabase.com:5432/postgres';
const LIVE = 'postgresql://postgres.liveref:pw@aws-1-ap-south-1.pooler.supabase.com:5432/postgres';

const post = async (body: unknown) => {
  const { POST } = await import('./route');
  return (await POST(new Request('http://localhost/api/admin/content-sync', { method: 'POST', body: JSON.stringify(body) }))) as Response;
};

describe('/api/admin/content-sync', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getServerSession.mockResolvedValue({ user: { id: 'admin-1', role: 'ADMIN' } });
    contentSyncRun.findMany.mockResolvedValue([]);
    runContentSync.mockResolvedValue({ runId: 'r1', applied: false, summary: { Question: { 'in-sync': 3, promote: 2 }, Book: { promote: 1 } }, issues: [], written: { live: 0, staging: 0, seeded: 0 } });
  });
  afterEach(() => vi.unstubAllEnvs());

  it('is for admins only', async () => {
    getServerSession.mockResolvedValue({ user: { id: 't1', role: 'TEACHER' } });
    expect((await post({ apply: false })).status).toBe(401);
    expect(runContentSync).not.toHaveBeenCalled();
  });

  it('refuses to publish from the live site', async () => {
    vi.stubEnv('CONTENT_ROLE', '');
    const res = await post({ apply: true });
    expect(res.status).toBe(409);
    expect((await res.json()).error).toMatch(/live site/);
    expect(runContentSync).not.toHaveBeenCalled();
  });

  it('needs to know where live is', async () => {
    vi.stubEnv('CONTENT_ROLE', 'staging');
    vi.stubEnv('DATABASE_URL', STAGING);
    vi.stubEnv('LIVE_DATABASE_URL', '');
    expect((await post({ apply: false })).status).toBe(409);
  });

  it('refuses when "live" is the staging database itself', async () => {
    vi.stubEnv('CONTENT_ROLE', 'staging');
    vi.stubEnv('DATABASE_URL', STAGING);
    vi.stubEnv('LIVE_DATABASE_URL', STAGING);
    expect((await post({ apply: true })).status).toBe(409);
    expect(runContentSync).not.toHaveBeenCalled();
  });

  it('previews by default and publishes only on apply: true, with totals across tables', async () => {
    vi.stubEnv('CONTENT_ROLE', 'staging');
    vi.stubEnv('DATABASE_URL', STAGING);
    vi.stubEnv('LIVE_DATABASE_URL', LIVE);
    const preview = await (await post({})).json();
    expect(runContentSync).toHaveBeenLastCalledWith(expect.objectContaining({ stagingUrl: STAGING, liveUrl: LIVE, apply: false, triggeredBy: 'admin:admin-1' }));
    expect(preview.totals).toEqual({ 'in-sync': 3, promote: 3 });

    await post({ apply: 'yes' });
    expect(runContentSync).toHaveBeenLastCalledWith(expect.objectContaining({ apply: false }));
    await post({ apply: true });
    expect(runContentSync).toHaveBeenLastCalledWith(expect.objectContaining({ apply: true }));
  });

  it('lists recent runs only on staging', async () => {
    const { GET } = await import('./route');
    vi.stubEnv('CONTENT_ROLE', '');
    const live = await (await GET()).json();
    expect(live).toMatchObject({ role: 'live', ready: false, runs: [] });
    expect(contentSyncRun.findMany).not.toHaveBeenCalled();
  });
});

describe('/api/admin/content-sync/resolve', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getServerSession.mockResolvedValue({ user: { id: 'admin-1', role: 'ADMIN' } });
    vi.stubEnv('CONTENT_ROLE', 'staging');
    vi.stubEnv('DATABASE_URL', STAGING);
    vi.stubEnv('LIVE_DATABASE_URL', LIVE);
    resolveConflict.mockResolvedValue({ runId: 'r2' });
  });
  afterEach(() => vi.unstubAllEnvs());

  const resolve = async (body: unknown) => {
    const { POST } = await import('./resolve/route');
    return (await POST(new Request('http://localhost/api/admin/content-sync/resolve', { method: 'POST', body: JSON.stringify(body) }))) as Response;
  };

  it('requires a table, an id and which side to keep', async () => {
    expect((await resolve({ table: 'Question', id: 'q1', keep: 'both' })).status).toBe(400);
    expect(resolveConflict).not.toHaveBeenCalled();
  });

  it('keeps the chosen side', async () => {
    const res = await resolve({ table: 'Question', id: 'q1', keep: 'live' });
    expect(res.status).toBe(200);
    expect(resolveConflict).toHaveBeenCalledWith(expect.objectContaining({ table: 'Question', id: 'q1', keep: 'live', stagingUrl: STAGING, liveUrl: LIVE }));
  });

  it('passes the reason back when it cannot', async () => {
    resolveConflict.mockRejectedValue(new Error('Approve or archive it in staging first: its status is DRAFT'));
    const res = await resolve({ table: 'Question', id: 'q1', keep: 'staging' });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/Approve or archive/);
  });
});
