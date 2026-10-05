import { beforeEach, describe, expect, it, vi } from 'vitest';

const getServerSession = vi.fn();
const user = { findUnique: vi.fn() };
const bookChapter = { findFirst: vi.fn() };
const revisionItem = { findMany: vi.fn() };
const studentFlashcard = { createMany: vi.fn() };

vi.mock('next-auth', () => ({ getServerSession }));
vi.mock('@/lib/auth', () => ({ authOptions: {} }));
vi.mock('@/lib/prisma', () => ({ default: { user, bookChapter, revisionItem, studentFlashcard } }));

const params = () => Promise.resolve({ chapterId: 'ch-1' });
const post = async (body: unknown = {}) => { const { POST } = await import('./route'); return await POST(new Request('http://localhost/x', { method: 'POST', body: JSON.stringify(body) }), { params: params() }) as Response; };

const items = [
  { id: 'i1', kind: 'DEFINITION', title: 'Continuity', body: 'A function f is continuous at x = c if ...' },
  { id: 'i2', kind: 'FORMULA', title: 'Product rule', body: '$(uv)\' = u\'v + uv\'$' },
];

describe('POST /api/student/revision/[chapterId]/flashcards', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getServerSession.mockResolvedValue({ user: { id: 'stu-1', role: 'STUDENT' } });
    user.findUnique.mockResolvedValue({ subscription: 'PREMIUM', class: 'Class 12' });
    bookChapter.findFirst.mockResolvedValue({ id: 'ch-1', name: 'Continuity and Differentiability' });
    revisionItem.findMany.mockResolvedValue(items);
    studentFlashcard.createMany.mockResolvedValue({ count: 2 });
  });

  it('requires a signed-in student', async () => {
    getServerSession.mockResolvedValueOnce(null);
    expect((await post()).status).toBe(401);
    getServerSession.mockResolvedValueOnce({ user: { id: 't1', role: 'TEACHER' } });
    expect((await post()).status).toBe(401);
  });

  it('is Premium only, and never touches the content for a free student', async () => {
    user.findUnique.mockResolvedValue({ subscription: 'FREE', class: 'Class 12' });
    expect((await post()).status).toBe(403);
    expect(revisionItem.findMany).not.toHaveBeenCalled();
    expect(studentFlashcard.createMany).not.toHaveBeenCalled();
  });

  it('only serves chapters of books written for the student\'s own class', async () => {
    bookChapter.findFirst.mockResolvedValue(null);
    expect((await post()).status).toBe(404);
    expect(bookChapter.findFirst.mock.calls[0][0].where).toEqual({ id: 'ch-1', book: { className: 'Class 12' } });
    expect(studentFlashcard.createMany).not.toHaveBeenCalled();
  });

  it('turns only APPROVED items into the student\'s own cards, with the book\'s text on the back', async () => {
    const data = await (await post()).json();
    expect(revisionItem.findMany.mock.calls[0][0].where).toMatchObject({ chapterId: 'ch-1', status: 'APPROVED' });
    const call = studentFlashcard.createMany.mock.calls[0][0];
    expect(call.skipDuplicates).toBe(true);
    expect(call.data).toEqual([
      { userId: 'stu-1', revisionItemId: 'i1', topic: 'Continuity and Differentiability', front: 'Define: Continuity', back: items[0].body },
      { userId: 'stu-1', revisionItemId: 'i2', topic: 'Continuity and Differentiability', front: 'Write the formula: Product rule', back: items[1].body },
    ]);
    expect(data).toEqual({ added: 2, alreadyAdded: 0 });
  });

  it('adding the same items again is reported, not duplicated', async () => {
    studentFlashcard.createMany.mockResolvedValue({ count: 0 });
    expect(await (await post()).json()).toEqual({ added: 0, alreadyAdded: 2 });
  });

  it('can add a chosen subset', async () => {
    await post({ itemIds: ['i2', 5, null] });
    expect(revisionItem.findMany.mock.calls[0][0].where.id).toEqual({ in: ['i2'] });
  });
});
