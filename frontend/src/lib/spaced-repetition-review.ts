import { computeNextReview, deriveQuestionReviewQuality, DEFAULT_SM2_STATE, type QuestionReviewSignal } from './spaced-repetition';

type SpacedRepetitionClient = {
  spacedRepetitionCard: {
    findUnique(args: unknown): Promise<{ easinessFactor: number; intervalDays: number; repetitions: number; lapses: number } | null>;
    upsert(args: unknown): Promise<unknown>;
  };
};

/**
 * Records one question review against the student's persisted SM-2 card,
 * creating it on a first miss (mirrors the old mistake-queue's "first miss
 * creates the entry" trigger exactly) or updating it on any later review.
 * A question always answered correctly never gets a card -- it should never
 * silently enter the review system.
 */
export async function recordQuestionReview(
  client: SpacedRepetitionClient,
  input: { userId: string; questionId: string; signal: QuestionReviewSignal; at?: Date },
) {
  const at = input.at ?? new Date();
  const existing = await client.spacedRepetitionCard.findUnique({
    where: { userId_questionId: { userId: input.userId, questionId: input.questionId } },
  });
  if (!existing && input.signal.isCorrect) return null;

  const quality = deriveQuestionReviewQuality(input.signal);
  const next = computeNextReview(existing ?? DEFAULT_SM2_STATE, quality, at);
  const isLapse = quality < 3;

  return client.spacedRepetitionCard.upsert({
    where: { userId_questionId: { userId: input.userId, questionId: input.questionId } },
    create: {
      userId: input.userId,
      questionId: input.questionId,
      easinessFactor: next.easinessFactor,
      intervalDays: next.intervalDays,
      repetitions: next.repetitions,
      lapses: isLapse ? 1 : 0,
      dueAt: next.dueAt,
      lastReviewedAt: at,
    },
    update: {
      easinessFactor: next.easinessFactor,
      intervalDays: next.intervalDays,
      repetitions: next.repetitions,
      lapses: isLapse ? (existing?.lapses ?? 0) + 1 : (existing?.lapses ?? 0),
      dueAt: next.dueAt,
      lastReviewedAt: at,
    },
  });
}

/**
 * Per-question time baseline for the practice-arena single-question submit
 * path, which (unlike a full test attempt) has no batch of sibling
 * responses to compute a median from. Mirrors the in-JS median aggregation
 * the performance report already does for commonMistakeGroups -- Prisma has
 * no median aggregate. Falls back to a flat default under 3 samples.
 */
const DEFAULT_TIME_BASELINE_SECONDS = 45;
const MIN_SAMPLES_FOR_MEDIAN = 3;

type TestResponseClient = {
  testResponse: { findMany(args: unknown): Promise<{ timeSpent: number }[]> };
};

export async function getQuestionTimeBaseline(client: TestResponseClient, questionId: string): Promise<number> {
  const rows = await client.testResponse.findMany({
    where: { questionId, status: { not: 'SKIPPED' } },
    select: { timeSpent: true },
    take: 50,
    orderBy: { id: 'desc' },
  });
  if (rows.length < MIN_SAMPLES_FOR_MEDIAN) return DEFAULT_TIME_BASELINE_SECONDS;
  const times = rows.map((r) => r.timeSpent).sort((a, b) => a - b);
  return times[Math.floor(times.length / 2)];
}
