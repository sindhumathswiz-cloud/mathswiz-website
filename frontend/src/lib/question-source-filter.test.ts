import { describe, expect, it } from 'vitest';
import { exerciseLabel, questionInExercise, reconcileSelection, sourceClauses, type ExerciseRange, type SourceBook } from './question-source-filter';

const exercise: ExerciseRange = { id: 'ex-1', chapterId: 'ch-7', bookId: 'book-1', startPage: 231, endPage: 237 };
const question = (overrides: Record<string, unknown> = {}) => ({ bookId: 'book-1', bookChapterId: 'ch-7', bookExerciseId: null, sourcePageStart: 233, ...overrides });

describe('questionInExercise', () => {
  it('claims a chapter question that starts inside the exercise pages, edges included', () => {
    expect(questionInExercise(question({ sourcePageStart: 231 }), exercise)).toBe(true);
    expect(questionInExercise(question({ sourcePageStart: 237 }), exercise)).toBe(true);
    expect(questionInExercise(question({ sourcePageStart: 230 }), exercise)).toBe(false);
    expect(questionInExercise(question({ sourcePageStart: 238 }), exercise)).toBe(false);
  });

  it('does not claim a question from another chapter that happens to share the page numbers', () => {
    expect(questionInExercise(question({ bookChapterId: 'ch-8' }), exercise)).toBe(false);
  });

  it('honours an explicit link in either direction, over the page range', () => {
    expect(questionInExercise(question({ bookExerciseId: 'ex-1', sourcePageStart: 999 }), exercise)).toBe(true);
    expect(questionInExercise(question({ bookExerciseId: 'ex-2' }), exercise)).toBe(false);
  });

  it('cannot place a question with no page, or an exercise with no page range', () => {
    expect(questionInExercise(question({ sourcePageStart: null }), exercise)).toBe(false);
    expect(questionInExercise(question(), { ...exercise, startPage: null })).toBe(false);
  });
});

describe('sourceClauses', () => {
  it('filters by book and chapter directly', () => {
    expect(sourceClauses({ bookId: 'book-1', bookChapterId: 'ch-7' }, null)).toEqual([{ bookId: 'book-1' }, { bookChapterId: 'ch-7' }]);
    expect(sourceClauses({}, null)).toEqual([]);
  });

  it('resolves an exercise by link or by page range within its chapter', () => {
    const clauses = sourceClauses({ bookId: 'book-1', bookChapterId: 'ch-7', bookExerciseId: 'ex-1' }, exercise);
    expect(clauses).toContainEqual({
      OR: [
        { bookExerciseId: 'ex-1' },
        { bookExerciseId: null, bookChapterId: 'ch-7', sourcePageStart: { gte: 231, lte: 237 } },
      ],
    });
  });

  it('falls back to the explicit link when the exercise has no page range', () => {
    expect(sourceClauses({ bookExerciseId: 'ex-1' }, { ...exercise, endPage: null })).toEqual([{ bookExerciseId: 'ex-1' }]);
  });

  it('matches nothing, never the whole book, for an unknown exercise or one from another chapter or book', () => {
    const nothing = [{ bookId: 'book-1' }, { id: { in: [] } }];
    expect(sourceClauses({ bookId: 'book-1', bookExerciseId: 'ghost' }, null)).toEqual(nothing);
    expect(sourceClauses({ bookId: 'book-1', bookExerciseId: 'ex-1' }, { ...exercise, bookId: 'book-2' })).toContainEqual({ id: { in: [] } });
    expect(sourceClauses({ bookChapterId: 'ch-9', bookExerciseId: 'ex-1' }, exercise)).toContainEqual({ id: { in: [] } });
  });
});

describe('exerciseLabel', () => {
  it('prefers the printed title, then the code, then the kind of section', () => {
    expect(exerciseLabel({ code: '7.1', title: 'Integration by parts' })).toBe('7.1 · Integration by parts');
    expect(exerciseLabel({ code: '7.1', title: 'Exercise 7.1' })).toBe('Exercise 7.1');
    expect(exerciseLabel({ title: 'Self-Assessment' })).toBe('Self-Assessment');
    expect(exerciseLabel({ code: '7.2' })).toBe('7.2');
    expect(exerciseLabel({ sectionType: 'MCQ' })).toBe('Multiple choice');
    expect(exerciseLabel({ sectionType: 'SOME_NEW_KIND' })).toBe('Some new kind');
    expect(exerciseLabel({})).toBe('Questions');
  });
});

describe('reconcileSelection', () => {
  const books: SourceBook[] = [{
    id: 'b1', title: 'Xam Idea', className: 'Class 12', total: 10,
    chapters: [{ id: 'c1', name: 'Integrals', chapterNumber: '7', total: 10, exercises: [{ id: 'e1', label: 'MCQ', sectionType: 'MCQ', total: 4 }] }],
  }];

  it('keeps a valid selection and drops whatever no longer exists beneath a change', () => {
    expect(reconcileSelection(books, { bookId: 'b1', chapterId: 'c1', exerciseId: 'e1' })).toEqual({ bookId: 'b1', chapterId: 'c1', exerciseId: 'e1' });
    expect(reconcileSelection(books, { bookId: 'b1', chapterId: 'c9', exerciseId: 'e1' })).toEqual({ bookId: 'b1', chapterId: '', exerciseId: '' });
    expect(reconcileSelection(books, { bookId: 'gone', chapterId: 'c1', exerciseId: 'e1' })).toEqual({ bookId: '', chapterId: '', exerciseId: '' });
  });
});
