import { beforeEach, describe, expect, it, vi } from 'vitest';

const getServerSession = vi.fn();
const user = { findUnique: vi.fn() };
vi.mock('next-auth', () => ({ getServerSession }));
vi.mock('@/lib/auth', () => ({ authOptions: {} }));
vi.mock('@/lib/prisma', () => ({ default: { user } }));
vi.mock('mammoth', () => ({ default: { extractRawText: vi.fn().mockResolvedValue({ value: 'hello' }) } }));

function post() {
  const form = new FormData();
  form.append('file', new Blob(['x']));
  return new Request('http://localhost/api/extract-word', { method: 'POST', body: form });
}

describe('POST /api/extract-word', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    user.findUnique.mockResolvedValue({ subscription: 'PREMIUM' });
  });

  it('rejects unauthenticated callers', async () => {
    getServerSession.mockResolvedValue(null);
    const { POST } = await import('./route');
    expect((await POST(post())).status).toBe(401);
  });

  it('rejects students and free teachers', async () => {
    const { POST } = await import('./route');
    getServerSession.mockResolvedValue({ user: { id: 's-1', role: 'STUDENT' } });
    expect((await POST(post())).status).toBe(403);
    getServerSession.mockResolvedValue({ user: { id: 't-1', role: 'TEACHER' } });
    user.findUnique.mockResolvedValue({ subscription: 'FREE' });
    expect((await POST(post())).status).toBe(403);
  });
});
