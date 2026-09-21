export interface MistakeQueueEntry {
  questionId: string;
  missCount: number;
  lastMissedAt: Date;
  dueAt: Date;
}

export interface SpacedRepetitionCardLite {
  questionId: string;
  lapses: number;
  lastReviewedAt: Date | null;
  createdAt: Date;
  dueAt: Date;
}

/**
 * Turns a student's persisted SM-2 question cards (lib/spaced-repetition.ts)
 * into the mistake queue's external shape. `missCount` maps 1:1 to `lapses`
 * (times the card was graded a failure), since a real SM-2 card no longer
 * tracks a live "still currently wrong" streak the way the old fixed-backoff
 * derivation did -- a card persists and keeps resurfacing on a growing
 * interval even after being answered correctly, it doesn't vanish on one
 * correct review. `lastMissedAt` falls back to `createdAt` for a card
 * that's never been reviewed since being created.
 *
 * Sorted oldest-review-first, so a review session clears the
 * longest-standing cards first -- same ordering the old derivation used.
 */
export function mistakesFromCards(cards: SpacedRepetitionCardLite[]): MistakeQueueEntry[] {
  return cards
    .map((c) => ({
      questionId: c.questionId,
      missCount: c.lapses,
      lastMissedAt: c.lastReviewedAt ?? c.createdAt,
      dueAt: c.dueAt,
    }))
    .sort((a, b) => a.lastMissedAt.getTime() - b.lastMissedAt.getTime());
}

export function isDueForReview(entry: MistakeQueueEntry, now: Date = new Date()): boolean {
  return entry.dueAt.getTime() <= now.getTime();
}
