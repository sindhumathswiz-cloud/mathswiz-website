import { beforeEach, describe, expect, it, vi } from 'vitest';

const getAuthenticatedUser = vi.fn();
const recordAuditLog = vi.fn();

const tx = {
  bookChapter: { upsert: vi.fn(), deleteMany: vi.fn() },
  bookExercise: { upsert: vi.fn(), deleteMany: vi.fn() },
};
const book = { findUnique: vi.fn() };
const $transaction = vi.fn(async (callback: (client: typeof tx) => unknown) => callback(tx));

vi.mock('@/lib/auth-server', () => ({ getAuthenticatedUser }));
vi.mock('@/lib/prisma', () => ({ default: { book, $transaction } }));
vi.mock('@/lib/audit-log', () => ({ recordAuditLog, requestAuditContext: () => ({}) }));

const params = Promise.resolve({ id: 'book-1' });
const put = (body: unknown) =>
  new Request('http://localhost/api/admin/books/book-1/manifest', { method: 'PUT', body: JSON.stringify(body) });

describe('GET /api/admin/books/[id]/manifest', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getAuthenticatedUser.mockResolvedValue({ user: { id: 'admin-1', role: 'ADMIN' } });
  });

  it('returns the stored chapters with a confirmed flag and the latest run page count', async () => {
    book.findUnique.mockResolvedValue({
      id: 'book-1', title: 'Xam Idea', className: 'Class 12',
      chapters: [
        { id: 'ch1', chapterNumber: '10', name: 'Vector Algebra', orderIndex: 0, topic: 'Vector Algebra', startPage: 100, endPage: 130, manifestConfirmedAt: new Date(), manifestConfirmedById: 'admin-1', exercises: [{ id: 's1', sectionType: 'MCQ' }] },
        { id: 'ch2', chapterNumber: '11', name: 'Probability', orderIndex: 1, topic: null, startPage: null, endPage: null, manifestConfirmedAt: null, manifestConfirmedById: null, exercises: [] },
      ],
      ingestionRuns: [{ id: 'run-1', totalPages: 534 }],
    });
    const { GET } = await import('./route');
    const data = await (await GET(new Request('http://x'), { params }) as Response).json();
    expect(data.run.totalPages).toBe(534);
    expect(data.chapters[0].confirmed).toBe(true);
    expect(data.chapters[0].sections).toHaveLength(1);
    expect(data.chapters[1].confirmed).toBe(false);
  });

  it('404s for an unknown book', async () => {
    book.findUnique.mockResolvedValue(null);
    const { GET } = await import('./route');
    const response = await GET(new Request('http://x'), { params }) as Response;
    expect(response.status).toBe(404);
  });
});

describe('PUT /api/admin/books/[id]/manifest', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getAuthenticatedUser.mockResolvedValue({ user: { id: 'admin-1', role: 'ADMIN' } });
    book.findUnique.mockResolvedValue({ id: 'book-1', ingestionRuns: [{ totalPages: 200 }] });
    tx.bookChapter.upsert.mockImplementation(async ({ create }: any) => ({ id: `ch-${create.orderIndex}` }));
    tx.bookExercise.upsert.mockImplementation(async ({ create }: any) => ({ id: `sec-${create.orderIndex}` }));
    tx.bookChapter.deleteMany.mockResolvedValue({});
    tx.bookExercise.deleteMany.mockResolvedValue({});
  });

  const chapter = (over: Record<string, unknown> = {}) => ({
    name: 'Vector Algebra', chapterNumber: '10', startPage: 10, endPage: 40,
    sections: [{ sectionType: 'MCQ', startPage: 10, endPage: 18, answerKeyStartPage: 30, answerKeyEndPage: 31 }],
    ...over,
  });

  it('rejects a non-array body', async () => {
    const { PUT } = await import('./route');
    expect((await PUT(put({}), { params }) as Response).status).toBe(400);
  });

  it('rejects a page beyond the run total', async () => {
    const { PUT } = await import('./route');
    const res = await PUT(put({ chapters: [chapter({ endPage: 500 })] }), { params }) as Response;
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/outside 1\.\.200/);
  });

  it('rejects overlapping chapters', async () => {
    const { PUT } = await import('./route');
    const res = await PUT(put({
      chapters: [
        chapter(),
        chapter({ name: 'Probability', startPage: 35, endPage: 60, sections: [{ sectionType: 'SHORT_ANSWER', startPage: 36, endPage: 50 }] }),
      ],
    }), { params }) as Response;
    expect((await res.json()).error).toMatch(/overlap/);
  });

  it('rejects a section sub-range outside its chapter', async () => {
    const { PUT } = await import('./route');
    const res = await PUT(put({ chapters: [chapter({ sections: [{ sectionType: 'MCQ', startPage: 10, endPage: 18, answerKeyStartPage: 45, answerKeyEndPage: 46 }] })] }), { params }) as Response;
    expect((await res.json()).error).toMatch(/outside the chapter/);
  });

  it('rejects a noAnswers section that also carries a range', async () => {
    const { PUT } = await import('./route');
    const res = await PUT(put({ chapters: [chapter({ sections: [{ sectionType: 'MCQ', startPage: 10, endPage: 18, noAnswers: true, answerKeyStartPage: 30, answerKeyEndPage: 31 }] })] }), { params }) as Response;
    expect((await res.json()).error).toMatch(/no answers/i);
  });

  it('upserts chapters + sections, marks them confirmed, prunes removed rows, and audits', async () => {
    const { PUT } = await import('./route');
    const res = await PUT(put({ chapters: [chapter()] }), { params }) as Response;
    expect(res.status).toBe(200);

    expect(tx.bookChapter.upsert).toHaveBeenCalledWith(expect.objectContaining({
      where: { bookId_orderIndex: { bookId: 'book-1', orderIndex: 0 } },
      update: expect.objectContaining({ name: 'Vector Algebra', manifestConfirmedById: 'admin-1' }),
    }));
    expect(tx.bookExercise.upsert).toHaveBeenCalledWith(expect.objectContaining({
      update: expect.objectContaining({ sectionType: 'MCQ', answerKeyStartPage: 30 }),
    }));
    expect(tx.bookChapter.deleteMany).toHaveBeenCalledWith({ where: { bookId: 'book-1', id: { notIn: ['ch-0'] } } });
    expect(recordAuditLog).toHaveBeenCalledWith(expect.objectContaining({ action: 'BOOK_MANIFEST_CONFIRMED' }));
  });
});
