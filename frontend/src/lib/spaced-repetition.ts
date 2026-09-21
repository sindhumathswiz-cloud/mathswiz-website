import { deriveConfidence } from './response-insight';

export type SM2Quality = 0 | 1 | 2 | 3 | 4 | 5;

export interface SM2State {
  easinessFactor: number; // floored at MIN_EASINESS_FACTOR
  intervalDays: number;   // 0 before the first review
  repetitions: number;    // consecutive passing (q>=3) reviews
}

export const DEFAULT_SM2_STATE: SM2State = { easinessFactor: 2.5, intervalDays: 0, repetitions: 0 };

const MIN_EASINESS_FACTOR = 1.3;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

export interface SM2Result extends SM2State {
  dueAt: Date;
}

/**
 * Standard SM-2 (Wozniak, SuperMemo 2). The easiness factor updates on
 * every review, pass or fail. On a fail (q<3) the interval resets to 1 day
 * and repetitions resets to 0 -- the card is due again tomorrow regardless
 * of how easy it had gotten. On a pass (q>=3) the interval follows the
 * classic 1 / 6 / interval*EF progression.
 */
export function computeNextReview(state: SM2State, quality: SM2Quality, now: Date = new Date()): SM2Result {
  const nextEasinessFactor = Math.max(
    MIN_EASINESS_FACTOR,
    state.easinessFactor + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02)),
  );

  let intervalDays: number;
  let repetitions: number;
  if (quality < 3) {
    repetitions = 0;
    intervalDays = 1;
  } else {
    repetitions = state.repetitions + 1;
    if (repetitions === 1) intervalDays = 1;
    else if (repetitions === 2) intervalDays = 6;
    else intervalDays = Math.round(state.intervalDays * nextEasinessFactor);
  }

  return {
    easinessFactor: nextEasinessFactor,
    intervalDays,
    repetitions,
    dueAt: new Date(now.getTime() + intervalDays * MS_PER_DAY),
  };
}

// The 4-button grade a flashcard reviewer picks, mapped to SM-2 quality.
// Skips 1/2 -- SM-2's rarely-distinguishable "recognized but wrong" grades
// -- since neither a 4-button UI nor a behavior-derived signal can tell
// those apart from a clean miss.
export const GRADE_QUALITY = { AGAIN: 0, HARD: 3, GOOD: 4, EASY: 5 } as const satisfies Record<string, SM2Quality>;
export type SM2Grade = keyof typeof GRADE_QUALITY;

export interface QuestionReviewSignal {
  isCorrect: boolean;
  timeSpent: number;
  medianTime: number;
  wasMarkedForReview?: boolean;
}

/**
 * Derives an SM-2 quality grade for a question review from existing
 * behavioral signals only -- no new self-report field, same house pattern
 * as lib/response-insight.ts's deriveConfidence(). A miss is always a full
 * lapse (q=0); a correct answer's quality follows how confident it looked.
 */
export function deriveQuestionReviewQuality(input: QuestionReviewSignal): SM2Quality {
  if (!input.isCorrect) return 0;
  const confidence = deriveConfidence({
    wasMarkedForReview: input.wasMarkedForReview ?? false,
    timeSpent: input.timeSpent,
    medianTime: input.medianTime,
  });
  return confidence === 'HIGH' ? 5 : confidence === 'MEDIUM' ? 4 : 3;
}
