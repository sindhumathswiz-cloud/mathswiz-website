import { describe, expect, it } from 'vitest';
import { bucketByDay, type PlannerItem } from './planner';

function item(id: string, date: Date, type: PlannerItem['type'] = 'TEST'): PlannerItem {
  return { id, type, title: id, date, href: '/x' };
}

describe('bucketByDay', () => {
  it('always returns 7 day buckets (Today..+6) even with no items', () => {
    const now = new Date('2026-01-05T10:00:00'); // a Monday
    const buckets = bucketByDay([], now);
    expect(buckets).toHaveLength(7);
    expect(buckets[0].label).toBe('Today');
    expect(buckets[1].label).toBe('Tomorrow');
    expect(buckets.every((b) => b.items.length === 0)).toBe(true);
  });

  it('omits the Overdue bucket entirely when nothing is overdue', () => {
    const now = new Date('2026-01-05T10:00:00');
    const buckets = bucketByDay([item('a', now)], now);
    expect(buckets.find((b) => b.label === 'Overdue')).toBeUndefined();
  });

  it('puts an item from yesterday in Overdue, not Today', () => {
    const now = new Date('2026-01-05T10:00:00');
    const yesterday = new Date('2026-01-04T23:00:00');
    const buckets = bucketByDay([item('a', yesterday)], now);
    const overdue = buckets.find((b) => b.label === 'Overdue');
    expect(overdue?.items.map((i) => i.id)).toEqual(['a']);
  });

  it('places an item due later today in Today regardless of the exact hour', () => {
    const now = new Date('2026-01-05T08:00:00');
    const laterToday = new Date('2026-01-05T23:30:00');
    const buckets = bucketByDay([item('a', laterToday)], now);
    expect(buckets[0].items.map((i) => i.id)).toEqual(['a']);
  });

  it('places an item just after midnight tonight in Tomorrow, not Today', () => {
    const now = new Date('2026-01-05T08:00:00');
    const justAfterMidnight = new Date('2026-01-06T00:05:00');
    const buckets = bucketByDay([item('a', justAfterMidnight)], now);
    expect(buckets[1].items.map((i) => i.id)).toEqual(['a']);
    expect(buckets[0].items).toEqual([]);
  });

  it('clamps an item further than 6 days out into the last bucket rather than dropping it', () => {
    const now = new Date('2026-01-05T10:00:00');
    const farOut = new Date('2026-01-20T10:00:00');
    const buckets = bucketByDay([item('a', farOut)], now);
    expect(buckets[6].items.map((i) => i.id)).toEqual(['a']);
  });

  it('sorts items within a bucket by date', () => {
    const now = new Date('2026-01-05T10:00:00');
    const later = new Date('2026-01-05T20:00:00');
    const earlier = new Date('2026-01-05T09:00:00');
    const buckets = bucketByDay([item('later', later), item('earlier', earlier)], now);
    expect(buckets[0].items.map((i) => i.id)).toEqual(['earlier', 'later']);
  });
});
