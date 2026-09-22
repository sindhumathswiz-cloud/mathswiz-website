import { describe, expect, it } from 'vitest';
import { inactivityAlert, repeatedDifficultyAlert, upcomingAssessmentAlert, computeAlerts } from './alerts';

const daysAgo = (d: number, now: Date) => new Date(now.getTime() - d * 24 * 60 * 60 * 1000);
const daysFromNow = (d: number, now: Date) => new Date(now.getTime() + d * 24 * 60 * 60 * 1000);

describe('inactivityAlert', () => {
  const now = new Date('2026-01-10T00:00:00Z');

  it('returns null when never active', () => {
    expect(inactivityAlert(null, 7, now)).toBeNull();
  });

  it('returns null just under the threshold', () => {
    expect(inactivityAlert(daysAgo(6, now), 7, now)).toBeNull();
  });

  it('fires exactly at the threshold', () => {
    expect(inactivityAlert(daysAgo(7, now), 7, now)?.type).toBe('INACTIVITY');
  });

  it('fires well past the threshold', () => {
    const alert = inactivityAlert(daysAgo(20, now), 7, now);
    expect(alert?.title).toContain('20 days');
  });
});

describe('repeatedDifficultyAlert', () => {
  it('returns null when nothing is below the needs_support band', () => {
    expect(repeatedDifficultyAlert([{ topic: 'Algebra', masteryScore: 60 }])).toBeNull();
  });

  it('fires for topics below 40, listing them', () => {
    const alert = repeatedDifficultyAlert([
      { topic: 'Algebra', masteryScore: 20 },
      { topic: 'Geometry', masteryScore: 80 },
      { topic: 'Trigonometry', masteryScore: 10 },
    ]);
    expect(alert?.detail).toBe('Algebra, Trigonometry');
    expect(alert?.title).toContain('2 topics');
  });

  it('uses singular phrasing for exactly one struggling topic', () => {
    const alert = repeatedDifficultyAlert([{ topic: 'Algebra', masteryScore: 20 }]);
    expect(alert?.title).toBe('1 topic needs support');
  });
});

describe('upcomingAssessmentAlert', () => {
  const now = new Date('2026-01-10T00:00:00Z');

  it('returns null with nothing due in the window', () => {
    expect(upcomingAssessmentAlert([{ id: 'a1', title: 'Far test', deadline: daysFromNow(20, now) }], 7, now)).toBeNull();
  });

  it('ignores a deadline already in the past', () => {
    expect(upcomingAssessmentAlert([{ id: 'a1', title: 'Past test', deadline: daysAgo(1, now) }], 7, now)).toBeNull();
  });

  it('fires for a deadline inside the window and names the soonest one', () => {
    const alert = upcomingAssessmentAlert([
      { id: 'a1', title: 'Later test', deadline: daysFromNow(6, now) },
      { id: 'a2', title: 'Sooner test', deadline: daysFromNow(2, now) },
    ], 7, now);
    expect(alert?.detail).toBe('Next: Sooner test');
    expect(alert?.title).toContain('2 assessments');
  });
});

describe('computeAlerts', () => {
  it('combines all three signals and filters out nulls', () => {
    const now = new Date('2026-01-10T00:00:00Z');
    const alerts = computeAlerts({
      lastActiveAt: daysAgo(10, now),
      progressRows: [{ topic: 'Algebra', masteryScore: 20 }],
      assignments: [{ id: 'a1', title: 'Test', deadline: daysFromNow(2, now) }],
      now,
    });
    expect(alerts.map((a) => a.type)).toEqual(['INACTIVITY', 'REPEATED_DIFFICULTY', 'UPCOMING_ASSESSMENT']);
  });

  it('returns an empty array when nothing is alertable', () => {
    const now = new Date('2026-01-10T00:00:00Z');
    const alerts = computeAlerts({ lastActiveAt: now, progressRows: [], assignments: [], now });
    expect(alerts).toEqual([]);
  });
});
