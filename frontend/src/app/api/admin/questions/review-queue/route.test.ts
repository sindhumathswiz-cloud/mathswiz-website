import { beforeEach, describe, expect, it, vi } from 'vitest';

const getAuthenticatedUser = vi.fn();
const question = { findMany: vi.fn() };

vi.mock('@/lib/auth-server', () => ({ getAuthenticatedUser }));
vi.mock('@/lib/prisma', () => ({ default: { question } }));

function get(path: string) {
  return new Request(`http://localhost/api/admin/questions/review-queue${path}`);
}

describe('GET /api/admin/questions/review-queue', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getAuthenticatedUser.mockResolvedValue({ user: { id: 'admin-1', role: 'ADMIN' } });
    question.findMany.mockResolvedValue([]);
  });

  it('rejects non-admin callers', async () => {
    getAuthenticatedUser.mockResolvedValue({ error: new Response(null, { status: 403 }) });
    const { GET } = await import('./route');
    const response = (await GET(get(''))) as Response;
    expect(response.status).toBe(403);
  });

  it('filters to DRAFT/REPORTED questions that are NEEDS_REVIEW or flagged by tag', async () => {
    const { GET } = await import('./route');
    await GET(get(''));

    expect(question.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        status: { in: ['DRAFT', 'REPORTED'] },
        OR: [
          { verificationStatus: 'NEEDS_REVIEW' },
          { tags: { hasSome: ['Second-Review: Flagged', 'AI-Verified: Flagged'] } },
        ],
      }),
    }));
  });

  it('applies an optional bookId and search filter', async () => {
    const { GET } = await import('./route');
    await GET(get('?bookId=book-1&search=vector'));

    expect(question.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        bookId: 'book-1',
        content: { contains: 'vector', mode: 'insensitive' },
      }),
    }));
  });

  it('cursor-paginates: takes PAGE_SIZE + 1 and returns nextCursor only when there is an extra row', async () => {
    const rows = Array.from({ length: 25 }, (_, i) => ({ id: `q-${i}` }));
    question.findMany.mockResolvedValue(rows); // 25 = PAGE_SIZE(24) + 1

    const { GET } = await import('./route');
    const data = await ((await GET(get(''))) as Response).json();

    expect(data.questions).toHaveLength(24);
    expect(data.nextCursor).toBe('q-24');
    expect(question.findMany).toHaveBeenCalledWith(expect.objectContaining({ take: 25 }));
  });

  it('passes the cursor through with skip:1', async () => {
    const { GET } = await import('./route');
    await GET(get('?cursor=q-23'));

    expect(question.findMany).toHaveBeenCalledWith(expect.objectContaining({
      cursor: { id: 'q-23' },
      skip: 1,
    }));
  });

  it('returns nextCursor null when a full page is not reached', async () => {
    question.findMany.mockResolvedValue([{ id: 'q-1' }]);
    const { GET } = await import('./route');
    const data = await ((await GET(get(''))) as Response).json();
    expect(data.nextCursor).toBeNull();
    expect(data.questions).toHaveLength(1);
  });
});
