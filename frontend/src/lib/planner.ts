export type PlannerItemType = 'QUESTION_REVIEW' | 'FLASHCARD_REVIEW' | 'TEST' | 'INTERVENTION';

export interface PlannerItem {
  id: string;
  type: PlannerItemType;
  title: string;
  date: Date; // the due/deadline/dueAt date this item is bucketed by
  href: string;
}

export interface PlannerBucket {
  label: string;
  date: string; // ISO yyyy-mm-dd for the bucket's own day (the Overdue bucket uses today's date)
  items: PlannerItem[];
}

const DAY_MS = 24 * 60 * 60 * 1000;
const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function addDays(d: Date, days: number): Date {
  const copy = new Date(d);
  copy.setDate(copy.getDate() + days);
  return copy;
}

/**
 * Buckets planner items into Overdue, Today, Tomorrow, then the rest of a
 * 7-day window (day-name labeled). Always returns all 7 upcoming-day
 * buckets, even empty ones, plus an Overdue bucket only when something is
 * actually overdue -- a pure function so day-boundary edge cases (exactly
 * midnight, an item further out than the window) are unit-testable without
 * touching Prisma.
 */
export function bucketByDay(items: PlannerItem[], now: Date = new Date()): PlannerBucket[] {
  const today = startOfDay(now);
  const overdue: PlannerItem[] = [];
  const byOffset = new Map<number, PlannerItem[]>();

  for (const item of items) {
    const offset = Math.round((startOfDay(item.date).getTime() - today.getTime()) / DAY_MS);
    if (offset < 0) {
      overdue.push(item);
      continue;
    }
    const clamped = Math.min(offset, 6);
    const list = byOffset.get(clamped) ?? [];
    list.push(item);
    byOffset.set(clamped, list);
  }

  const buckets: PlannerBucket[] = [];
  if (overdue.length > 0) {
    overdue.sort((a, b) => a.date.getTime() - b.date.getTime());
    buckets.push({ label: 'Overdue', date: today.toISOString().slice(0, 10), items: overdue });
  }

  for (let offset = 0; offset <= 6; offset++) {
    const day = addDays(today, offset);
    const label = offset === 0 ? 'Today' : offset === 1 ? 'Tomorrow' : DAY_NAMES[day.getDay()];
    const dayItems = (byOffset.get(offset) ?? []).sort((a, b) => a.date.getTime() - b.date.getTime());
    buckets.push({ label, date: day.toISOString().slice(0, 10), items: dayItems });
  }

  return buckets;
}
