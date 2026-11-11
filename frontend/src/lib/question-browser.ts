import type { Prisma, QuestionStatus } from '@prisma/client';

/**
 * Filters for the question browser (admins and teachers finding questions to put into a paper or practice sheet),
 * read from a query string and turned into a question query. Pure: the book / chapter / exercise part is resolved
 * by the caller (lib/question-sources), since an exercise needs its page range loaded.
 */

export const BROWSER_PAGE_SIZE = 25;
const MAX_PAGE_SIZE = 100;

export const QUESTION_TYPES = [
  'SINGLE_CHOICE', 'MULTIPLE_CHOICE', 'INTEGER', 'TRUE_FALSE', 'SUBJECTIVE', 'FILL_IN_BLANKS',
  'ASSERTION_REASONING', 'CASE_STUDY', 'VERY_SHORT_ANSWER', 'SHORT_ANSWER', 'LONG_ANSWER',
] as const;
export const DIFFICULTIES = ['EASY', 'MEDIUM', 'HARD'] as const;
/** What an admin may narrow to; teachers always see approved questions plus their own. */
export const ADMIN_STATUSES = ['APPROVED', 'PENDING_REVIEW', 'DRAFT', 'REPORTED'] as const;

export interface BrowserFilters {
  /** Words that must all appear in the question text (any order, any case), or a question id. */
  search: string;
  className: string | null;
  bookId: string | null;
  bookChapterId: string | null;
  bookExerciseId: string | null;
  topic: string | null;
  types: string[];
  difficulties: string[];
  /** 'with' = has a worked solution, 'without' = has none. */
  solution: 'with' | 'without' | null;
  /** Admins only: one status, or every status except archived ('ALL'). Defaults to approved. */
  status: string;
  /** Teachers: only the questions they wrote. */
  mine: boolean;
  sort: 'book' | 'newest';
  page: number;
  pageSize: number;
}

const list = (value: string | null, allowed: readonly string[]) =>
  (value ?? '').split(',').map((v) => v.trim()).filter((v) => allowed.includes(v));
const id = (value: string | null) => (value && /^[A-Za-z0-9_-]{1,64}$/.test(value) ? value : null);

export function parseBrowserFilters(params: URLSearchParams): BrowserFilters {
  const page = Number.parseInt(params.get('page') ?? '', 10);
  const pageSize = Number.parseInt(params.get('pageSize') ?? '', 10);
  const solution = params.get('solution');
  const status = params.get('status') ?? 'APPROVED';
  return {
    search: (params.get('q') ?? '').trim().slice(0, 200),
    className: params.get('class')?.trim().slice(0, 40) || null,
    bookId: id(params.get('bookId')),
    bookChapterId: id(params.get('bookChapterId')),
    bookExerciseId: id(params.get('bookExerciseId')),
    topic: params.get('topic')?.trim().slice(0, 200) || null,
    types: list(params.get('types'), QUESTION_TYPES),
    difficulties: list(params.get('difficulties'), DIFFICULTIES),
    solution: solution === 'with' || solution === 'without' ? solution : null,
    status: status === 'ALL' || (ADMIN_STATUSES as readonly string[]).includes(status) ? status : 'APPROVED',
    mine: params.get('mine') === '1',
    sort: params.get('sort') === 'newest' ? 'newest' : 'book',
    page: Number.isInteger(page) && page > 0 ? page : 1,
    pageSize: Number.isInteger(pageSize) && pageSize > 0 ? Math.min(pageSize, MAX_PAGE_SIZE) : BROWSER_PAGE_SIZE,
  };
}

const HAS_SOLUTION: Prisma.QuestionWhereInput = {
  OR: [{ AND: [{ explanation: { not: null } }, { NOT: { explanation: '' } }] }, { solution: { isNot: null } }],
};

export type FacetDimension = 'types' | 'difficulties' | 'topic';

/**
 * The query for these filters, as seen by this viewer. `except` leaves one dimension out, so a facet's counts say
 * how many questions each of its values would give with every other filter kept.
 *
 *  - A teacher sees approved public questions and their own (whatever their status); "mine" narrows to their own.
 *  - An admin sees one status (approved by default) or every status but archived.
 *  - Archived questions are never listed.
 */
export function browserWhere(
  filters: BrowserFilters,
  viewer: { userId: string; role: string },
  sourceClauses: Prisma.QuestionWhereInput[] = [],
  except?: FacetDimension,
): Prisma.QuestionWhereInput {
  const and: Prisma.QuestionWhereInput[] = [{ status: { not: 'ARCHIVED' } }];

  if (viewer.role === 'ADMIN') {
    if (filters.status !== 'ALL') and.push({ status: filters.status as QuestionStatus });
  } else if (filters.mine) {
    and.push({ createdById: viewer.userId });
  } else {
    and.push({ OR: [{ status: 'APPROVED', scope: 'PUBLIC' }, { createdById: viewer.userId }] });
  }

  const search = filters.search;
  if (search) {
    if (/^c[a-z0-9]{20,30}$/.test(search)) and.push({ id: search });
    else for (const word of search.split(/\s+/).filter(Boolean).slice(0, 8)) and.push({ content: { contains: word, mode: 'insensitive' } });
  }
  if (filters.className) and.push({ OR: [{ class: filters.className }, { book: { className: filters.className } }] });
  and.push(...sourceClauses);
  if (filters.topic && except !== 'topic') and.push({ topic: filters.topic });
  if (filters.types.length && except !== 'types') and.push({ type: { in: filters.types as Prisma.EnumQuestionTypeFilter['in'] } });
  if (filters.difficulties.length && except !== 'difficulties') and.push({ difficulty: { in: filters.difficulties as Prisma.EnumDifficultyFilter['in'] } });
  if (filters.solution === 'with') and.push(HAS_SOLUTION);
  if (filters.solution === 'without') and.push({ NOT: HAS_SOLUTION });
  return { AND: and };
}

/** Book order: book, then page, then printed number; questions with no book come last, newest first. */
export function browserOrder(sort: BrowserFilters['sort']): Prisma.QuestionOrderByWithRelationInput[] {
  if (sort === 'newest') return [{ createdAt: 'desc' }, { id: 'asc' }];
  return [
    { book: { title: 'asc' } },
    { sourcePageStart: { sort: 'asc', nulls: 'last' } },
    { printedNumber: { sort: 'asc', nulls: 'last' } },
    { createdAt: 'desc' },
    { id: 'asc' },
  ];
}
