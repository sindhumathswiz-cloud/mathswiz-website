import { beforeEach, describe, expect, it, vi } from 'vitest';

const getServerSession = vi.fn();
const question = { count: vi.fn(), findMany: vi.fn(), groupBy: vi.fn() };
const assessQuestionsRisk = vi.fn();

vi.mock('next-auth', () => ({ getServerSession }));
vi.mock('@/lib/auth', () => ({ authOptions: {} }));
vi.mock('@/lib/prisma', () => ({ default: { question } }));
vi.mock('@/lib/question-risk', () => ({ assessQuestionsRisk }));

async function call() {
  const { GET } = await import('./route');
  return GET(new Request('http://localhost/api/admin/questions/stats') as any) as Promise<Response>;
}

describe('GET /api/admin/questions/stats -- content quality extension', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getServerSession.mockResolvedValue({ user: { id: 'admin-1', role: 'ADMIN' } });
    question.count.mockResolvedValue(0);
    // findMany is used both by the fire-and-forget taxonomy backfill and by
    // the new bounded open-pool fetch -- default both to empty.
    question.findMany.mockResolvedValue([]);
    question.groupBy.mockResolvedValue([]);
    assessQuestionsRisk.mockResolvedValue(new Map());
  });

  it('rejects unauthenticated callers', async () => {
    getServerSession.mockResolvedValue(null);
    const response = await call();
    expect(response.status).toBe(401);
  });

  it('computes flaggedPercent from the verificationStatus groupBy', async () => {
    question.count.mockResolvedValue(100); // total
    question.groupBy.mockImplementation(({ by }: any) => {
      if (by[0] === 'verificationStatus') {
        return Promise.resolve([
          { verificationStatus: 'NEEDS_REVIEW', _count: 25 },
          { verificationStatus: 'VERIFIED', _count: 75 },
        ]);
      }
      return Promise.resolve([]);
    });
    const body = await (await call()).json();
    expect(body.stats.byVerificationStatus).toEqual({ NEEDS_REVIEW: 25, VERIFIED: 75 });
    expect(body.stats.flaggedPercent).toBe(25);
  });

  it('scopes the risk pool to open (not-yet-approved) statuses only', async () => {
    await call();
    expect(question.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { status: { in: ['DRAFT', 'REPORTED', 'PENDING_REVIEW'] } },
      take: 500,
    }));
  });

  it('breaks down risk by book title, counting only blocked questions toward blockedCount', async () => {
    question.findMany.mockImplementation(({ where }: any) => {
      // Distinguish the taxonomy-backfill query (has an OR clause) from the
      // open-pool query (has a status.in clause) by shape.
      if (where?.status) {
        return Promise.resolve([
          { id: 'q-1', content: 'x', options: [], correctAnswer: 'A', explanation: '', type: 'SINGLE_CHOICE', provenance: 'BOOK_SOURCED', bookId: 'book-1', sourcePageStart: 1, sourcePageEnd: 1, printedNumber: '1', confidence: 90, book: { title: 'RS Aggarwal' } },
          { id: 'q-2', content: 'y', options: [], correctAnswer: 'B', explanation: '', type: 'SINGLE_CHOICE', provenance: 'BOOK_SOURCED', bookId: 'book-1', sourcePageStart: 2, sourcePageEnd: 2, printedNumber: '2', confidence: 90, book: { title: 'RS Aggarwal' } },
        ]);
      }
      return Promise.resolve([]);
    });
    assessQuestionsRisk.mockResolvedValue(new Map([
      ['q-1', { score: 90, blockers: [] }],
      ['q-2', { score: 30, blockers: ['no printedNumber'] }],
    ]));
    const body = await (await call()).json();
    expect(body.stats.riskByBook['RS Aggarwal']).toEqual({ blockedCount: 1, avgScore: 60 });
    expect(body.stats.riskPoolSize).toBe(2);
    expect(body.stats.riskPoolCapped).toBe(false);
  });
});
