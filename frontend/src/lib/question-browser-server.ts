import type { Prisma } from '@prisma/client';
import prisma from './prisma';
import { resolveSourceClauses } from './question-sources';
import { browserWhere, type BrowserFilters } from './question-browser';

/**
 * The database half of the question filters (lib/question-browser), shared by every page that lists questions with
 * them: Find Questions, the admin Question Bank and Flagged Questions.
 */

export type Viewer = { userId: string; role: string };
export type Facets = { types: Array<{ value: string; count: number }>; difficulties: Array<{ value: string; count: number }>; topics: Array<{ value: string; count: number }> };

/** The book / chapter / exercise part of the filters, which needs an exercise's page range loaded. */
export async function browserSources(filters: BrowserFilters): Promise<Prisma.QuestionWhereInput[]> {
  if (!filters.bookId && !filters.bookChapterId && !filters.bookExerciseId) return [];
  return resolveSourceClauses({ bookId: filters.bookId, bookChapterId: filters.bookChapterId, bookExerciseId: filters.bookExerciseId });
}

/** The question query for these filters plus any conditions a page adds (e.g. "has a pending flag"). */
export function filteredWhere(
  filters: BrowserFilters, viewer: Viewer, sources: Prisma.QuestionWhereInput[], extra: Prisma.QuestionWhereInput[] = [],
  except?: Parameters<typeof browserWhere>[3],
): Prisma.QuestionWhereInput {
  const where = browserWhere(filters, viewer, sources, except);
  return extra.length ? { AND: [where, ...extra] } : where;
}

/** How many questions each type, difficulty and topic would give, each with every other filter kept. */
export async function browserFacets(filters: BrowserFilters, viewer: Viewer, sources: Prisma.QuestionWhereInput[], extra: Prisma.QuestionWhereInput[] = []): Promise<Facets> {
  const [types, difficulties, topics] = await Promise.all([
    prisma.question.groupBy({ by: ['type'], where: filteredWhere(filters, viewer, sources, extra, 'types'), _count: { _all: true } }),
    prisma.question.groupBy({ by: ['difficulty'], where: filteredWhere(filters, viewer, sources, extra, 'difficulties'), _count: { _all: true } }),
    prisma.question.groupBy({ by: ['topic'], where: filteredWhere(filters, viewer, sources, extra, 'topic'), _count: { _all: true } }),
  ]);
  const byCount = (a: { count: number }, b: { count: number }) => b.count - a.count;
  return {
    types: types.map((t) => ({ value: t.type, count: t._count._all })).sort(byCount),
    difficulties: difficulties.map((d) => ({ value: d.difficulty, count: d._count._all })),
    topics: topics.filter((t) => t.topic).map((t) => ({ value: t.topic as string, count: t._count._all })).sort(byCount),
  };
}
