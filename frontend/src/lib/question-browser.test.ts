import { describe, expect, it } from 'vitest';
import { browserWhere, parseBrowserFilters } from './question-browser';

const parse = (q: string) => parseBrowserFilters(new URLSearchParams(q));
const teacher = { userId: 't1', role: 'TEACHER' };
const admin = { userId: 'a1', role: 'ADMIN' };
const and = (where: ReturnType<typeof browserWhere>) => where.AND as unknown[];

describe('parseBrowserFilters', () => {
  it('reads every filter and drops values it does not know', () => {
    const f = parse('q=  integral  sin &class=Class 12&bookId=b1&topic=Integrals&types=SINGLE_CHOICE,BOGUS,INTEGER&difficulties=HARD,EXTREME&solution=with&status=DRAFT&sort=newest&page=3&pageSize=50');
    expect(f).toMatchObject({
      search: 'integral  sin', className: 'Class 12', bookId: 'b1', topic: 'Integrals', types: ['SINGLE_CHOICE', 'INTEGER'],
      difficulties: ['HARD'], solution: 'with', status: 'DRAFT', sort: 'newest', page: 3, pageSize: 50,
    });
  });

  it('falls back to approved, book order, the first page of 25, and caps the page size', () => {
    expect(parse('status=ARCHIVED&sort=x&page=-2&pageSize=999')).toMatchObject({ status: 'APPROVED', sort: 'book', page: 1, pageSize: 100 });
    expect(parse('')).toMatchObject({ status: 'APPROVED', page: 1, pageSize: 25, solution: null, mine: false });
  });

  it('refuses an id that is not an id', () => {
    expect(parse('bookId=x%27%20or%201%3D1').bookId).toBeNull();
  });
});

describe('browserWhere', () => {
  it('shows a teacher approved public questions and their own, never archived ones', () => {
    const where = and(browserWhere(parse(''), teacher));
    expect(where).toContainEqual({ status: { not: 'ARCHIVED' } });
    expect(where).toContainEqual({ OR: [{ status: 'APPROVED', scope: 'PUBLIC' }, { createdById: 't1' }] });
  });

  it('narrows a teacher to their own questions, and ignores a status they ask for', () => {
    const where = and(browserWhere(parse('mine=1&status=DRAFT'), teacher));
    expect(where).toContainEqual({ createdById: 't1' });
    expect(where).not.toContainEqual({ status: 'DRAFT' });
  });

  it('shows an admin one status, approved by default, or every status but archived', () => {
    expect(and(browserWhere(parse(''), admin))).toContainEqual({ status: 'APPROVED' });
    expect(and(browserWhere(parse('status=REPORTED'), admin))).toContainEqual({ status: 'REPORTED' });
    const all = and(browserWhere(parse('status=ALL'), admin));
    expect(all).toEqual([{ status: { not: 'ARCHIVED' } }]);
  });

  it('needs every search word somewhere in the text, and finds a question by its id', () => {
    const where = and(browserWhere(parse('q=sin  integral'), admin));
    expect(where).toContainEqual({ content: { contains: 'sin', mode: 'insensitive' } });
    expect(where).toContainEqual({ content: { contains: 'integral', mode: 'insensitive' } });
    expect(and(browserWhere(parse('q=cmq0lpa40002uqwl6rfqtqjef'), admin))).toContainEqual({ id: 'cmq0lpa40002uqwl6rfqtqjef' });
  });

  it('adds the book clauses it is given, and the type, difficulty, topic and class filters', () => {
    const where = and(browserWhere(parse('class=Class 12&types=INTEGER&difficulties=EASY,HARD&topic=Matrices'), admin, [{ bookId: 'b1' }]));
    expect(where).toContainEqual({ bookId: 'b1' });
    expect(where).toContainEqual({ type: { in: ['INTEGER'] } });
    expect(where).toContainEqual({ difficulty: { in: ['EASY', 'HARD'] } });
    expect(where).toContainEqual({ topic: 'Matrices' });
    expect(where).toContainEqual({ OR: [{ class: 'Class 12' }, { book: { className: 'Class 12' } }] });
  });

  it('leaves out the dimension a facet is counting', () => {
    const where = and(browserWhere(parse('types=INTEGER&difficulties=EASY'), admin, [], 'types'));
    expect(where).not.toContainEqual({ type: { in: ['INTEGER'] } });
    expect(where).toContainEqual({ difficulty: { in: ['EASY'] } });
  });

  it('tells questions with a worked solution from those without', () => {
    const withSolution = and(browserWhere(parse('solution=with'), admin)).at(-1) as { OR: unknown[] };
    expect(withSolution.OR).toContainEqual({ solution: { isNot: null } });
    const without = and(browserWhere(parse('solution=without'), admin)).at(-1) as { NOT: unknown };
    expect(without.NOT).toEqual(withSolution);
  });
});
