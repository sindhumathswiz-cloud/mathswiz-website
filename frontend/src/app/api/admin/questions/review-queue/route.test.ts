import { beforeEach, describe, expect, it, vi } from 'vitest';

const getAuthenticatedUser = vi.fn();
const question = { findMany: vi.fn() };

vi.mock('@/lib/auth-server', () => ({ getAuthenticatedUser }));
vi.mock('@/lib/prisma', () => ({ default: { question } }));

const assessQuestionsRisk = vi.fn();
vi.mock('@/lib/question-risk', () => ({ assessQuestionsRisk }));

function get(path: string) {
  return new Request(`http://localhost/api/admin/questions/review-queue${path}`);
}

const baseQuestion = {
  id: 'q-1', content: 'x', options: null, correctAnswer: null, explanation: null, type: 'SINGLE_CHOICE',
  status: 'DRAFT', verificationStatus: 'STRUCTURALLY_VALID', provenance: 'MANUALLY_AUTHORED',
  bookId: null, sourcePageStart: null, sourcePageEnd: null, printedNumber: null, confidence: 90,
  tags: [] as string[], reviewNotes: null, topic: null, subTopic: null, book: null,
};

describe('GET /api/admin/questions/review-queue', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getAuthenticatedUser.mockResolvedValue({ user: { id: 'admin-1', role: 'ADMIN' } });
    question.findMany.mockResolvedValue([]);
    assessQuestionsRisk.mockResolvedValue(new Map());
  });

  it('rejects non-admin callers', async () => {
    getAuthenticatedUser.mockResolvedValue({ error: new Response(null, { status: 403 }) });
    const { GET } = await import('./route');
    const response = (await GET(get(''))) as Response;
    expect(response.status).toBe(403);
  });

  it('queries DRAFT/REPORTED/PENDING_REVIEW candidates plus Gate-Swept-tagged APPROVED ones, unfiltered by other tags/verificationStatus at the DB level', async () => {
    const { GET } = await import('./route');
    await GET(get(''));

    expect(question.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        OR: [
          { status: { in: ['DRAFT', 'REPORTED', 'PENDING_REVIEW'] } },
          { status: 'APPROVED', tags: { has: 'Gate-Swept: Flagged' } },
        ],
      },
      take: 500,
    }));
  });

  it('keeps an APPROVED question tagged Gate-Swept: Flagged even with a clean live risk score', async () => {
    question.findMany.mockResolvedValue([{ ...baseQuestion, id: 'q-1', status: 'APPROVED', tags: ['Gate-Swept: Flagged'] }]);
    assessQuestionsRisk.mockResolvedValue(new Map([['q-1', { score: 90, blockers: [] }]]));
    const { GET } = await import('./route');
    const data = await ((await GET(get(''))) as Response).json();
    expect(data.questions).toHaveLength(1);
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

  it('keeps a question with a gate blocker even if verificationStatus and tags look clean', async () => {
    question.findMany.mockResolvedValue([{ ...baseQuestion, id: 'q-1' }]);
    assessQuestionsRisk.mockResolvedValue(new Map([['q-1', { score: 30, blockers: ['no retained figure asset'] }]]));
    const { GET } = await import('./route');
    const data = await ((await GET(get(''))) as Response).json();

    expect(data.questions).toHaveLength(1);
    expect(data.questions[0].risk.blockers).toEqual(['no retained figure asset']);
  });

  it('keeps a question flagged by verificationStatus NEEDS_REVIEW even with zero gate blockers', async () => {
    question.findMany.mockResolvedValue([{ ...baseQuestion, id: 'q-1', verificationStatus: 'NEEDS_REVIEW' }]);
    assessQuestionsRisk.mockResolvedValue(new Map([['q-1', { score: 90, blockers: [] }]]));
    const { GET } = await import('./route');
    const data = await ((await GET(get(''))) as Response).json();
    expect(data.questions).toHaveLength(1);
  });

  it('keeps a question tagged AI-Verified: Flagged even with zero gate blockers', async () => {
    question.findMany.mockResolvedValue([{ ...baseQuestion, id: 'q-1', tags: ['AI-Verified: Flagged'] }]);
    assessQuestionsRisk.mockResolvedValue(new Map([['q-1', { score: 90, blockers: [] }]]));
    const { GET } = await import('./route');
    const data = await ((await GET(get(''))) as Response).json();
    expect(data.questions).toHaveLength(1);
  });

  it('drops a question with zero blockers, no flag tag, and no NEEDS_REVIEW status -- nothing here needs a human yet', async () => {
    question.findMany.mockResolvedValue([{ ...baseQuestion, id: 'q-1' }]);
    assessQuestionsRisk.mockResolvedValue(new Map([['q-1', { score: 90, blockers: [] }]]));
    const { GET } = await import('./route');
    const data = await ((await GET(get(''))) as Response).json();
    expect(data.questions).toHaveLength(0);
  });

  it('sorts kept rows riskiest (lowest score) first', async () => {
    question.findMany.mockResolvedValue([
      { ...baseQuestion, id: 'q-safe', verificationStatus: 'NEEDS_REVIEW' },
      { ...baseQuestion, id: 'q-risky', verificationStatus: 'NEEDS_REVIEW' },
    ]);
    assessQuestionsRisk.mockResolvedValue(new Map([
      ['q-safe', { score: 70, blockers: [] }],
      ['q-risky', { score: 10, blockers: ['two things wrong'] }],
    ]));
    const { GET } = await import('./route');
    const data = await ((await GET(get(''))) as Response).json();
    expect(data.questions.map((q: any) => q.id)).toEqual(['q-risky', 'q-safe']);
  });

  it('paginates the sorted, filtered list with an offset-style cursor', async () => {
    const rows = Array.from({ length: 30 }, (_, i) => ({ ...baseQuestion, id: `q-${i}`, verificationStatus: 'NEEDS_REVIEW' }));
    question.findMany.mockResolvedValue(rows);
    assessQuestionsRisk.mockResolvedValue(new Map(rows.map((r) => [r.id, { score: 50, blockers: [] }])));

    const { GET } = await import('./route');
    const first = await ((await GET(get(''))) as Response).json();
    expect(first.questions).toHaveLength(24);
    expect(first.nextCursor).toBe('24');

    const second = await ((await GET(get('?cursor=24'))) as Response).json();
    expect(second.questions).toHaveLength(6);
    expect(second.nextCursor).toBeNull();
  });

  it('reports whether the candidate pool hit the cap', async () => {
    const rows = Array.from({ length: 500 }, (_, i) => ({ ...baseQuestion, id: `q-${i}` }));
    question.findMany.mockResolvedValue(rows);
    assessQuestionsRisk.mockResolvedValue(new Map(rows.map((r) => [r.id, { score: 90, blockers: [] }])));

    const { GET } = await import('./route');
    const data = await ((await GET(get(''))) as Response).json();
    expect(data.poolSize).toBe(500);
    expect(data.poolCapped).toBe(true);
  });
});
