type MasteryClient = {
  studentProgress: {
    findUnique(args: unknown): Promise<{ masteryScore: number; currentStreak: number } | null>;
    upsert(args: unknown): Promise<unknown>;
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
  source: 'PRACTICE' | 'TEST' | 'HOMEWORK';
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
