type MasteryClient = {
  studentProgress: {
    findUnique(args: unknown): Promise<{ masteryScore: number; currentStreak: number } | null>;
    upsert(args: unknown): Promise<unknown>;
    findMany(args: unknown): Promise<{ userId: string; topic: string; masteryScore: number }[]>;
    update(args: unknown): Promise<unknown>;
  };
  masteryEvent: { create(args: unknown): Promise<unknown> };
};

type QuestionDifficulty = 'EASY' | 'MEDIUM' | 'HARD';

// Getting a hard question right says more about mastery than getting an easy
// one right, and missing an easy question is a bigger red flag than missing
// a hard one — so the score movement scales with difficulty in both
// directions rather than a flat +5/-2 for every question.
const DELTA_BY_DIFFICULTY: Record<QuestionDifficulty, { correct: number; incorrect: number }> = {
  EASY: { correct: 3, incorrect: -3 },
  MEDIUM: { correct: 5, incorrect: -2 },
  HARD: { correct: 8, incorrect: -1 },
};

// Unknown/missing difficulty (older data, or a source that doesn't carry it)
// falls back to the original flat behavior rather than guessing.
const DEFAULT_DELTA = { correct: 5, incorrect: -2 };

function isQuestionDifficulty(value: unknown): value is QuestionDifficulty {
  return value === 'EASY' || value === 'MEDIUM' || value === 'HARD';
}

export function deltaForAttempt(isCorrect: boolean, difficulty?: string | null): number {
  const table = isQuestionDifficulty(difficulty) ? DELTA_BY_DIFFICULTY[difficulty] : DEFAULT_DELTA;
  return isCorrect ? table.correct : table.incorrect;
}

export async function applyMasteryUpdate(client: MasteryClient, input: {
  userId: string;
  topic: string;
  isCorrect: boolean;
  source: 'PRACTICE' | 'TEST' | 'HOMEWORK' | 'DECAY';
  difficulty?: QuestionDifficulty | string | null;
  attemptId?: string | null;
  questionId?: string | null;
  at?: Date;
}) {
  const at = input.at ?? new Date();
  const current = await client.studentProgress.findUnique({
    where: { userId_topic: { userId: input.userId, topic: input.topic } },
    select: { masteryScore: true, currentStreak: true },
  });
  const previousScore = current?.masteryScore ?? 0;
  const requestedDelta = deltaForAttempt(input.isCorrect, input.difficulty);
  const newScore = Math.max(0, Math.min(100, previousScore + requestedDelta));
  const delta = newScore - previousScore;
  await client.studentProgress.upsert({
    where: { userId_topic: { userId: input.userId, topic: input.topic } },
    create: { userId: input.userId, topic: input.topic, masteryScore: newScore, currentStreak: input.isCorrect ? 1 : 0, lastPracticedAt: at },
    update: { masteryScore: newScore, currentStreak: input.isCorrect ? (current?.currentStreak ?? 0) + 1 : 0, lastPracticedAt: at },
  });
  await client.masteryEvent.create({
    data: { userId: input.userId, topic: input.topic, source: input.source, previousScore, newScore, delta, isCorrect: input.isCorrect, attemptId: input.attemptId ?? null, questionId: input.questionId ?? null, createdAt: at },
  });
  return { previousScore, newScore, delta };
}

// Tunable placeholder, not confirmed pedagogy -- same status as the
// thresholds in lib/learning-path.ts. A month with zero practice on a
// topic is treated as "gone stale" for spaced-repetition purposes.
export const MASTERY_INACTIVITY_RESET_DAYS = 30;

// This codebase has no cron/scheduled-job infrastructure (see the same
// on-demand pattern in lib/alerts.ts) -- so staleness is swept lazily,
// scoped to whichever students' data is actually being read right now
// (their own mastery page, or a teacher's batch view), rather than via a
// background job scanning every student on a timer.
export async function sweepStaleMastery(client: MasteryClient, userIds: string[], at: Date = new Date()) {
  if (userIds.length === 0) return 0;
  const cutoff = new Date(at.getTime() - MASTERY_INACTIVITY_RESET_DAYS * 24 * 60 * 60 * 1000);
  const stale = await client.studentProgress.findMany({
    where: { userId: { in: userIds }, masteryScore: { gt: 0 }, lastPracticedAt: { lt: cutoff } },
    select: { userId: true, topic: true, masteryScore: true },
  });
  for (const row of stale) {
    await client.studentProgress.update({
      where: { userId_topic: { userId: row.userId, topic: row.topic } },
      data: { masteryScore: 0, currentStreak: 0 },
    });
    await client.masteryEvent.create({
      data: {
        userId: row.userId,
        topic: row.topic,
        source: 'DECAY',
        previousScore: row.masteryScore,
        newScore: 0,
        delta: -row.masteryScore,
        isCorrect: false,
        createdAt: at,
      },
    });
  }
  return stale.length;
}
