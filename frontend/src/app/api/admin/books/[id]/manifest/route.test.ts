import { beforeEach, describe, expect, it, vi } from 'vitest';

const getAuthenticatedUser = vi.fn();
const recordAuditLog = vi.fn();

/* eslint-disable @typescript-eslint/no-explicit-any */
const tx = {
  bookChapter: { update: vi.fn(), create: vi.fn(), deleteMany: vi.fn() },
  bookExercise: { deleteMany: vi.fn(), createMany: vi.fn() },
  $executeRaw: vi.fn(),
};
const bookChapter = { findMany: vi.fn() };
const book = { findUnique: vi.fn() };
const question = { count: vi.fn() };
const $transaction = vi.fn(async (cb: (client: typeof tx) => unknown) => cb(tx));
/* eslint-enable @typescript-eslint/no-explicit-any */

vi.mock('@/lib/auth-server', () => ({ getAuthenticatedUser }));
vi.mock('@/lib/prisma', () => ({ default: { book, bookChapter, question, $transaction } }));
vi.mock('@/lib/audit-log', () => ({ recordAuditLog, requestAuditContext: () => ({}) }));

const params = Promise.resolve({ id: 'book-1' });
const put = (body: unknown) => new Request('http://localhost/api/admin/books/book-1/manifest', { method: 'PUT', body: JSON.stringify(body) });

describe('GET /api/admin/books/[id]/manifest', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getAuthenticatedUser.mockResolvedValue({ user: { id: 'admin-1', role: 'ADMIN' } });
  });

  it('returns managed chapters with a confirmed flag, printed pages and per-range question counts', async () => {
    book.findUnique.mockResolvedValue({
      id: 'book-1', title: 'Xam Idea', className: 'Class 12',
      chapters: [
        { id: 'ch1', chapterNumber: '10', name: 'Vector Algebra', orderIndex: 0, topic: 'Vector Algebra', startPage: 334, endPage: 363, printedStartPage: 329, printedEndPage: 358, manifestConfirmedAt: new Date(), exercises: [{ id: 's1', sectionType: 'MCQ' }] },
        { id: 'ch2', chapterNumber: '11', name: 'Probability', orderIndex: 1, topic: null, startPage: null, endPage: null, printedStartPage: null, printedEndPage: null, manifestConfirmedAt: null, exercises: [] },
      ],
      ingestionRuns: [{ id: 'run-1', totalPages: 534 }],
    });
    question.count.mockResolvedValue(24);
    const { GET } = await import('./route');
    const data = await (await GET(new Request('http://x'), { params }) as Response).json();
    expect(data.run.totalPages).toBe(534);
    expect(data.chapters[0].confirmed).toBe(true);
    expect(data.chapters[0].questionsInRange).toBe(24);
    expect(data.chapters[1].questionsInRange).toBe(0);
  });
});

describe('PUT /api/admin/books/[id]/manifest', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getAuthenticatedUser.mockResolvedValue({ user: { id: 'admin-1', role: 'ADMIN' } });
    book.findUnique.mockResolvedValue({ id: 'book-1', ingestionRuns: [{ totalPages: 534 }] });
    bookChapter.findMany.mockResolvedValue([]);
    tx.bookChapter.update.mockImplementation(async ({ where }: any) => ({ id: where.id }));
    tx.bookChapter.create.mockImplementation(async ({ data }: any) => ({ id: `new-${data.orderIndex}` }));
    tx.bookChapter.deleteMany.mockResolvedValue({});
    tx.bookExercise.deleteMany.mockResolvedValue({});
    tx.bookExercise.createMany.mockResolvedValue({});
    tx.$executeRaw.mockResolvedValue(0);
  });

  const chapter = (over: Record<string, unknown> = {}) => ({
    name: 'Vector Algebra', chapterNumber: '10', startPage: 334, endPage: 363, printedStartPage: 329, printedEndPage: 358, confirmed: false,
    sections: [{ sectionType: 'MCQ', startPage: 334, endPage: 345, answerKeyStartPage: 360, answerKeyEndPage: 361, answerKeyCoverage: 'SELECTED' }],
    ...over,
  });

  it('rejects a non-array body, an out-of-range page, an overlap and a bad coverage value', async () => {
    const { PUT } = await import('./route');
    expect((await PUT(put({}), { params }) as Response).status).toBe(400);
    expect((await PUT(put({ chapters: [chapter({ endPage: 999 })] }), { params }) as Response).status).toBe(400);
    const overlap = await PUT(put({ chapters: [chapter(), chapter({ name: 'Probability', startPage: 350, endPage: 400, sections: [{ sectionType: 'SHORT_ANSWER', startPage: 355, endPage: 380 }] })] }), { params }) as Response;
    expect((await overlap.json()).error).toMatch(/overlap/);
    const badCov = await PUT(put({ chapters: [chapter({ sections: [{ sectionType: 'MCQ', startPage: 334, endPage: 345, answerKeyStartPage: 360, answerKeyEndPage: 361, answerKeyCoverage: 'PARTIAL' }] })] }), { params }) as Response;
    expect((await badCov.json()).error).toMatch(/coverage/i);
  });

  it('confirms only the chapters flagged confirmed and wipes+recreates their sections', async () => {
    const { PUT } = await import('./route');
    await PUT(put({ chapters: [chapter({ confirmed: true }), chapter({ name: 'Probability', startPage: 400, endPage: 450, printedStartPage: null, printedEndPage: null, confirmed: false, sections: [] })] }), { params });
    const created = tx.bookChapter.create.mock.calls.map((c) => c[0].data);
    expect(created[0]).toMatchObject({ name: 'Vector Algebra', manifestConfirmedById: 'admin-1' });
    expect(created[0].manifestConfirmedAt).toBeInstanceOf(Date);
    expect(created[1]).toMatchObject({ name: 'Probability', manifestConfirmedAt: null });
    expect(tx.bookExercise.createMany).toHaveBeenCalledWith(expect.objectContaining({
      data: [expect.objectContaining({ sectionType: 'MCQ', answerKeyStartPage: 360, answerKeyCoverage: 'SELECTED' })],
    }));
  });

  it('reuses an existing chapter by name, parks survivors in one statement, prunes only empty unconfirmed rows', async () => {
    bookChapter.findMany.mockResolvedValue([
      { id: 'existing-vec', name: 'Vector Algebra', orderIndex: 5, manifestConfirmedAt: null, _count: { questions: 12 } },
      { id: 'junk-empty', name: 'Linear Equations', orderIndex: 6, manifestConfirmedAt: null, _count: { questions: 0 } },
      { id: 'junk-withq', name: 'Maximum and Minimum', orderIndex: 7, manifestConfirmedAt: null, _count: { questions: 3 } },
    ]);
    const { PUT } = await import('./route');
    await PUT(put({ chapters: [chapter({ confirmed: true })] }), { params });

    // Vector Algebra updates the existing row (questions stay linked).
    expect(tx.bookChapter.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'existing-vec' }, data: expect.objectContaining({ orderIndex: 0, name: 'Vector Algebra' }),
    }));
    expect(tx.bookChapter.create).not.toHaveBeenCalled();
    // Only the empty, unconfirmed junk row is deleted.
    expect(tx.bookChapter.deleteMany).toHaveBeenCalledWith({ where: { id: { in: ['junk-empty'] } } });
    // The park + leftover shift each run as a single raw statement.
    expect(tx.$executeRaw).toHaveBeenCalledTimes(2);
    expect(recordAuditLog).toHaveBeenCalledWith(expect.objectContaining({ action: 'BOOK_MANIFEST_SAVED' }));
  });
});
