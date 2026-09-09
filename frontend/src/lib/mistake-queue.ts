export interface MasteryEventLite {
  questionId: string | null;
  isCorrect: boolean;
  createdAt: Date;
}

export interface MistakeQueueEntry {
  questionId: string;
  missCount: number;
  lastMissedAt: Date;
  dueAt: Date;
}

// Spaced-repetition-style backoff: a question resurfaces soon after the
// first miss, and further out each additional time it's missed and still
// not corrected — so a persistent trouble spot keeps coming back, but one
// slip doesn't nag the student again a few minutes later. The schedule caps
// out at weekly once a question has been missed several times running.
const REVIEW_INTERVALS_HOURS = [4, 24, 72, 168];

/**
 * Reduces a student's MasteryEvent history (ordered or not) into one entry
 * per question that is currently "wrong and not yet corrected" — i.e. the
 * most recent attempt at that question was incorrect. A question drops out
 * entirely once the student answers it correctly again.
 *
 * Returned entries are NOT filtered by due-ness — callers decide whether to
 * use `dueAt` (for a passive nudge/badge, spaced out by missCount) or show
 * everything regardless of schedule (for an explicit "review my mistakes"
 * action the student asked for). Sorted oldest-miss-first either way, so a
 * review session clears the longest-standing mistakes first.
 */
export function computeMistakeQueue(
  events: MasteryEventLite[],
  now: Date = new Date(),
): MistakeQueueEntry[] {
  const byQuestion = new Map<string, MasteryEventLite[]>();
  for (const e of events) {
    if (!e.questionId) continue;
    const list = byQuestion.get(e.questionId) ?? [];
    list.push(e);
    byQuestion.set(e.questionId, list);
  }

  const entries: MistakeQueueEntry[] = [];
  for (const [questionId, list] of byQuestion) {
    const sorted = [...list].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
    const last = sorted[sorted.length - 1];
    if (last.isCorrect) continue; // most recent attempt was correct — cleared

    // Count the unbroken run of misses ending at `last`.
    let missCount = 0;
    for (let i = sorted.length - 1; i >= 0; i--) {
      if (sorted[i].isCorrect) break;
      missCount++;
    }

    const intervalHours = REVIEW_INTERVALS_HOURS[Math.min(missCount - 1, REVIEW_INTERVALS_HOURS.length - 1)];
    const dueAt = new Date(last.createdAt.getTime() + intervalHours * 60 * 60 * 1000);
    entries.push({ questionId, missCount, lastMissedAt: last.createdAt, dueAt });
  }

  return entries.sort((a, b) => a.lastMissedAt.getTime() - b.lastMissedAt.getTime());
}

export function isDueForReview(entry: MistakeQueueEntry, now: Date = new Date()): boolean {
  return entry.dueAt.getTime() <= now.getTime();
}
