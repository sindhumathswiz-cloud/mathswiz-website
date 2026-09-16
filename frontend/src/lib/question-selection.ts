import type { Difficulty, Prisma, QuestionType } from '@prisma/client';
import prisma from '@/lib/prisma';

export interface QuestionFilterSpec {
  topic?: string;
  difficulty?: Difficulty;
  type?: QuestionType;
  bookChapterId?: string;
  count?: number;
}

/**
 * The single source of truth for "pick N approved questions matching these
 * filters" -- called in-process (not over HTTP) by the AI blueprint
 * generator, the structured filter-pick route, and intervention content
 * generation. Kept as a plain function (not a route) specifically so
 * intervention creation can call it inside a Prisma $transaction.
 */
export async function selectQuestionsByFilters(filters: QuestionFilterSpec[]) {
  let results: Awaited<ReturnType<typeof prisma.question.findMany>> = [];
  for (const filter of filters) {
    const where: Prisma.QuestionWhereInput = { status: 'APPROVED' };
    if (filter.topic) where.topic = { contains: filter.topic, mode: 'insensitive' };
    if (filter.difficulty) where.difficulty = filter.difficulty;
    if (filter.type) where.type = filter.type;
    if (filter.bookChapterId) where.bookChapterId = filter.bookChapterId;

    const matched = await prisma.question.findMany({
      where,
      take: filter.count || 5,
    });
    results = results.concat(matched);
  }
  return results;
}

/**
 * Which difficulty band(s) to draw remedial practice from, given a
 * student's current mastery score for the topic. Tunable heuristic, not
 * fixed pedagogy -- not the mastery scoring formula itself (see
 * lib/mastery.ts), just a selection band for generated practice content.
 */
export function masteryToDifficultyBand(masteryScore: number): Difficulty[] {
  if (masteryScore < 25) return ['EASY'];
  if (masteryScore < 55) return ['EASY', 'MEDIUM'];
  return ['MEDIUM', 'HARD'];
}
