import { beforeEach, describe, expect, it, vi } from 'vitest';

const revisionItem = { groupBy: vi.fn(), findMany: vi.fn() };
const bookChapter = { findMany: vi.fn(), findFirst: vi.fn() };
const studentFlashcard = { findMany: vi.fn() };
const testQuestion = { findMany: vi.fn() };

vi.mock('./prisma', () => ({ default: { revisionItem, bookChapter, studentFlashcard, testQuestion } }));

describe('student-revision', () => {
  beforeEach(() => vi.clearAllMocks());

  describe('loadRevisionChapters', () => {
    it('is empty for a student with no class, without querying', async () => {
      const { loadRevisionChapters } = await import('./student-revision');
      expect(await loadRevisionChapters(null)).toEqual([]);
      expect(revisionItem.groupBy).not.toHaveBeenCalled();
    });

    it('counts only approved items of books for the student\'s class, in book order', async () => {
      revisionItem.groupBy.mockResolvedValue([
        { chapterId: 'c12', kind: 'FORMULA', _count: { _all: 5 } },
        { chapterId: 'c2', kind: 'DEFINITION', _count: { _all: 2 } },
        { chapterId: 'c2', kind: 'THEOREM', _count: { _all: 1 } },
      ]);
      bookChapter.findMany.mockResolvedValue([
        { id: 'c12', chapterNumber: '12', name: 'Linear Programming', startPage: 392, book: { title: 'Xam Idea' } },
        { id: 'c2', chapterNumber: '2', name: 'Inverse Trigonometric Functions', startPage: 45, book: { title: 'Xam Idea' } },
      ]);
      const { loadRevisionChapters } = await import('./student-revision');
      const chapters = await loadRevisionChapters('Class 12');
      expect(revisionItem.groupBy.mock.calls[0][0].where).toEqual({ status: 'APPROVED', book: { className: 'Class 12' } });
      expect(chapters.map(c => [c.name, c.total])).toEqual([['Inverse Trigonometric Functions', 3], ['Linear Programming', 5]]);
      expect(chapters[0].byKind).toEqual({ DEFINITION: 2, THEOREM: 1 });
      expect(chapters[0]).not.toHaveProperty('startPage');
    });
  });

  describe('loadRevisionSheet', () => {
    it('is null for another class\'s chapter and for a chapter with nothing approved', async () => {
      const { loadRevisionSheet } = await import('./student-revision');
      bookChapter.findFirst.mockResolvedValueOnce(null);
      expect(await loadRevisionSheet('c1', 'stu', 'Class 11')).toBeNull();
      expect(bookChapter.findFirst.mock.calls[0][0].where).toEqual({ id: 'c1', book: { className: 'Class 11' } });

      bookChapter.findFirst.mockResolvedValueOnce({ id: 'c1', name: 'X', chapterNumber: '1', book: { title: 'B' } });
      revisionItem.findMany.mockResolvedValueOnce([]);
      expect(await loadRevisionSheet('c1', 'stu', 'Class 11')).toBeNull();
    });

    it('groups approved items by kind and marks the ones already in the student\'s flashcards', async () => {
      bookChapter.findFirst.mockResolvedValue({ id: 'c1', name: 'Integrals', chapterNumber: '7', book: { title: 'Xam Idea' } });
      revisionItem.findMany.mockResolvedValue([
        { id: 'a', kind: 'FORMULA', title: 'By parts', body: 'b1', sourcePage: 230 },
        { id: 'b', kind: 'DEFINITION', title: 'Antiderivative', body: 'b2', sourcePage: 226 },
      ]);
      studentFlashcard.findMany.mockResolvedValue([{ revisionItemId: 'b' }]);
      const { loadRevisionSheet } = await import('./student-revision');
      const sheet = (await loadRevisionSheet('c1', 'stu', 'Class 12'))!;
      expect(revisionItem.findMany.mock.calls[0][0].where).toEqual({ chapterId: 'c1', status: 'APPROVED' });
      expect(sheet.groups.map(g => g.label)).toEqual(['Definitions', 'Formulas']);
      expect(sheet.groups[0].items[0]).toMatchObject({ id: 'b', inFlashcards: true });
      expect(sheet.groups[1].items[0]).toMatchObject({ id: 'a', inFlashcards: false });
      expect(sheet).toMatchObject({ total: 2, inFlashcards: 1 });
    });
  });

  describe('revisionChaptersForTests', () => {
    it('lists each test\'s chapters that have approved content, heaviest first, and skips chapters with none', async () => {
      testQuestion.findMany.mockResolvedValue([
        ...['c1', 'c1', 'c1', 'c2'].map(c => ({ section: { testId: 't1' }, question: { bookChapterId: c } })),
        { section: { testId: 't1' }, question: { bookChapterId: 'c3' } },
        { section: { testId: 't2' }, question: { bookChapterId: 'c3' } },
      ]);
      revisionItem.groupBy.mockResolvedValue([{ chapterId: 'c1', _count: { _all: 12 } }, { chapterId: 'c2', _count: { _all: 4 } }]);
      bookChapter.findMany.mockResolvedValue([{ id: 'c1', name: 'Integrals' }, { id: 'c2', name: 'Matrices' }, { id: 'c3', name: 'No content' }]);
      const { revisionChaptersForTests } = await import('./student-revision');
      const map = await revisionChaptersForTests(['t1', 't2']);
      expect(map.get('t1')).toEqual([{ chapterId: 'c1', name: 'Integrals', items: 12 }, { chapterId: 'c2', name: 'Matrices', items: 4 }]);
      expect(map.has('t2')).toBe(false);
    });

    it('does no work for no tests, and never fails the page when it errors', async () => {
      const { revisionChaptersForTests, withRevisionLinks } = await import('./student-revision');
      expect((await revisionChaptersForTests([])).size).toBe(0);
      expect(testQuestion.findMany).not.toHaveBeenCalled();

      testQuestion.findMany.mockRejectedValue(new Error('db down'));
      const out = await withRevisionLinks([{ id: 'a1', test: { id: 't1' } }, { id: 'a2', test: null }]);
      expect(out.map(a => a.revisionChapters)).toEqual([[], []]);
    });
  });
});
