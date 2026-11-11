/**
 * The question filters as the pages hold them (Find Questions, the admin Question Bank, Flagged Questions): their
 * state, how they are written into the address so a reload or a shared link keeps them, and their labels.
 * lib/question-browser reads the same parameters on the server.
 */

export const TYPE_LABEL: Record<string, string> = {
  SINGLE_CHOICE: 'Single choice', MULTIPLE_CHOICE: 'Multiple choice', INTEGER: 'Numerical', TRUE_FALSE: 'True / false',
  SUBJECTIVE: 'Written', FILL_IN_BLANKS: 'Fill in the blanks', ASSERTION_REASONING: 'Assertion–reason', CASE_STUDY: 'Case study',
  VERY_SHORT_ANSWER: 'Very short answer', SHORT_ANSWER: 'Short answer', LONG_ANSWER: 'Long answer',
};
export const DIFFICULTY_LABEL: Record<string, string> = { EASY: 'Easy', MEDIUM: 'Medium', HARD: 'Hard' };
export const STATUS_LABEL: Record<string, string> = { APPROVED: 'Approved', PENDING_REVIEW: 'Pending review', DRAFT: 'Draft', REPORTED: 'Reported', ALL: 'Any status' };

export type Facet = { value: string; count: number };
export type Facets = { types: Facet[]; difficulties: Facet[]; topics: Facet[] };

export type Filters = {
  q: string; class: string; bookId: string; bookChapterId: string; bookExerciseId: string; topic: string;
  types: string[]; difficulties: string[]; solution: string; status: string; mine: boolean; sort: 'book' | 'newest';
};

export const EMPTY_FILTERS: Filters = {
  q: '', class: '', bookId: '', bookChapterId: '', bookExerciseId: '', topic: '', types: [], difficulties: [], solution: '', status: 'APPROVED', mine: false, sort: 'book',
};

/** Whether anything narrows the list beyond the page's own defaults (the status is left to the page). */
export const filtersActive = (f: Filters, defaults: Filters = EMPTY_FILTERS) =>
  JSON.stringify({ ...f, status: '', sort: '' }) !== JSON.stringify({ ...defaults, status: '', sort: '' });

export function toParams(f: Filters, page: number, pageSize: number, defaults: Filters = EMPTY_FILTERS) {
  const p = new URLSearchParams();
  if (f.q.trim()) p.set('q', f.q.trim());
  if (f.class) p.set('class', f.class);
  if (f.bookId) p.set('bookId', f.bookId);
  if (f.bookChapterId) p.set('bookChapterId', f.bookChapterId);
  if (f.bookExerciseId) p.set('bookExerciseId', f.bookExerciseId);
  if (f.topic) p.set('topic', f.topic);
  if (f.types.length) p.set('types', f.types.join(','));
  if (f.difficulties.length) p.set('difficulties', f.difficulties.join(','));
  if (f.solution) p.set('solution', f.solution);
  if (f.status !== defaults.status) p.set('status', f.status);
  if (f.mine) p.set('mine', '1');
  if (f.sort !== defaults.sort) p.set('sort', f.sort);
  if (page > 1) p.set('page', String(page));
  if (pageSize !== 25) p.set('pageSize', String(pageSize));
  return p;
}

export function fromParams(p: URLSearchParams, defaults: Filters = EMPTY_FILTERS): { filters: Filters; page: number; pageSize: number } {
  return {
    filters: {
      q: p.get('q') ?? '', class: p.get('class') ?? '', bookId: p.get('bookId') ?? '', bookChapterId: p.get('bookChapterId') ?? '',
      bookExerciseId: p.get('bookExerciseId') ?? '', topic: p.get('topic') ?? '',
      types: (p.get('types') ?? '').split(',').filter(Boolean), difficulties: (p.get('difficulties') ?? '').split(',').filter(Boolean),
      solution: p.get('solution') ?? '', status: p.get('status') ?? defaults.status, mine: p.get('mine') === '1',
      sort: (p.get('sort') ?? defaults.sort) === 'newest' ? 'newest' : 'book',
    },
    page: Math.max(1, Number.parseInt(p.get('page') ?? '1', 10) || 1),
    pageSize: [25, 50, 100].includes(Number(p.get('pageSize'))) ? Number(p.get('pageSize')) : 25,
  };
}
