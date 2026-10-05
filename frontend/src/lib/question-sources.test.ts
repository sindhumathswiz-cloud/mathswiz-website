import { beforeEach, describe, expect, it, vi } from 'vitest';

const question = { findMany: vi.fn() };
const book = { findMany: vi.fn() };
const bookChapter = { findMany: vi.fn() };
const bookExercise = { findMany: vi.fn(), findUnique: vi.fn() };

vi.mock('./prisma', () => ({ default: { question, book, bookChapter, bookExercise } }));

const q = (bookChapterId: string | null, sourcePageStart: number | null, extra: Record<string, unknown> = {}) => ({ bookId: 'b1', bookChapterId, bookExerciseId: null, sourcePageStart, ...extra });

describe('loadQuestionSources', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    book.findMany.mockResolvedValue([{ id: 'b1', title: 'Xam Idea Mathematics', className: 'Class 12' }]);
    bookChapter.findMany.mockResolvedValue([
      // Deliberately out of book order, as extraction leaves them.
      { id: 'c8', bookId: 'b1', name: 'Application of Integrals', chapterNumber: '8', startPage: 272, orderIndex: 1822 },
      { id: 'c7', bookId: 'b1', name: 'Integrals', chapterNumber: '7', startPage: 225, orderIndex: 6 },
      { id: 'c9', bookId: 'b1', name: 'Differential Equations', chapterNumber: '9', startPage: 296, orderIndex: 8 },
    ]);
    bookExercise.findMany.mockResolvedValue([
      { id: 'e-sa', chapterId: 'c7', code: null, title: null, sectionType: 'SHORT_ANSWER', startPage: 243, endPage: 259, orderIndex: 4 },
      { id: 'e-mcq', chapterId: 'c7', code: null, title: 'Multiple Choice Questions', sectionType: 'MCQ', startPage: 238, endPage: 239, orderIndex: 1 },
      { id: 'e-empty', chapterId: 'c7', code: null, title: 'Proficiency Exercise', sectionType: 'EXERCISE', startPage: 266, endPage: 268, orderIndex: 7 },
    ]);
    question.findMany.mockResolvedValue([q('c7', 238), q('c7', 239), q('c7', 245), q('c7', 250), q('c7', 251), q('c8', 275), q('c7', null)]);
  });

  it('asks only for approved, public, book-sourced questions', async () => {
    const { loadQuestionSources } = await import('./question-sources');
    await loadQuestionSources();
    expect(question.findMany.mock.calls[0][0].where).toEqual({ status: 'APPROVED', scope: 'PUBLIC', bookId: { not: null } });
  });

  it('lists chapters in book order with counts, and never lists a node with no approved questions', async () => {
    const { loadQuestionSources } = await import('./question-sources');
    const [result] = await loadQuestionSources();
    expect(result).toMatchObject({ id: 'b1', title: 'Xam Idea Mathematics', className: 'Class 12', total: 7 });
    // c9 has no approved questions, so it is not offered.
    expect(result.chapters.map(c => [c.name, c.total])).toEqual([['Integrals', 6], ['Application of Integrals', 1]]);
  });

  it('counts exercise questions by page range, in page order, and hides exercises that have none', async () => {
    const { loadQuestionSources } = await import('./question-sources');
    const [result] = await loadQuestionSources();
    const integrals = result.chapters.find(c => c.id === 'c7')!;
    expect(integrals.exercises).toEqual([
      { id: 'e-mcq', label: 'Multiple Choice Questions', sectionType: 'MCQ', total: 2 },
      { id: 'e-sa', label: 'Short answer', sectionType: 'SHORT_ANSWER', total: 3 },
    ]);
    // The question with no page is in the chapter total but in no exercise.
    expect(integrals.total).toBe(6);
  });

  it('tells two sections with the same label apart by their pages', async () => {
    bookExercise.findMany.mockResolvedValue([
      { id: 'e-a', chapterId: 'c7', code: null, title: null, sectionType: 'LONG_ANSWER', startPage: 238, endPage: 239, orderIndex: 5 },
      { id: 'e-b', chapterId: 'c7', code: null, title: null, sectionType: 'LONG_ANSWER', startPage: 245, endPage: 245, orderIndex: 6 },
    ]);
    const { loadQuestionSources } = await import('./question-sources');
    const [result] = await loadQuestionSources();
    expect(result.chapters.find(c => c.id === 'c7')!.exercises.map(e => e.label)).toEqual(['Long answer (pp. 238–239)', 'Long answer (p. 245)']);
  });

  it('returns nothing when no approved question has a book', async () => {
    question.findMany.mockResolvedValue([]);
    const { loadQuestionSources } = await import('./question-sources');
    expect(await loadQuestionSources()).toEqual([]);
    expect(book.findMany).not.toHaveBeenCalled();
  });
});

describe('resolveSourceClauses', () => {
  beforeEach(() => vi.clearAllMocks());

  it('does not touch the database for a book or chapter filter', async () => {
    const { resolveSourceClauses } = await import('./question-sources');
    expect(await resolveSourceClauses({ bookId: 'b1', bookChapterId: 'c7' })).toEqual([{ bookId: 'b1' }, { bookChapterId: 'c7' }]);
    expect(bookExercise.findUnique).not.toHaveBeenCalled();
  });

  it('loads the exercise to resolve its page range, and matches nothing for one that does not exist', async () => {
    bookExercise.findUnique.mockResolvedValueOnce({ id: 'e1', chapterId: 'c7', startPage: 231, endPage: 237, chapter: { bookId: 'b1' } });
    const { resolveSourceClauses } = await import('./question-sources');
    const clauses = await resolveSourceClauses({ bookExerciseId: 'e1' });
    expect(clauses[0]).toMatchObject({ OR: [{ bookExerciseId: 'e1' }, { sourcePageStart: { gte: 231, lte: 237 } }] });

    bookExercise.findUnique.mockResolvedValueOnce(null);
    expect(await resolveSourceClauses({ bookExerciseId: 'ghost' })).toEqual([{ id: { in: [] } }]);
  });
});
