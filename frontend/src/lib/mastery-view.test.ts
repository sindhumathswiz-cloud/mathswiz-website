import { describe, expect, it } from 'vitest';
import { masteryBand, masterySummary } from './mastery-view';

describe('mastery view helpers', () => {
  it('uses clear mastery thresholds', () => {
    expect(masteryBand(39)).toBe('needs_support');
    expect(masteryBand(40)).toBe('developing');
    expect(masteryBand(69)).toBe('developing');
    expect(masteryBand(70)).toBe('secure');
  });

  it('summarizes averages and priority topics', () => {
    const summary = masterySummary([
      { topic: 'Algebra', masteryScore: 30 },
      { topic: 'Geometry', masteryScore: 60 },
      { topic: 'Calculus', masteryScore: 90 },
    ]);
    expect(summary.average).toBe(60);
    expect(summary.needsSupport.map((item) => item.topic)).toEqual(['Algebra']);
    expect(summary.secure.map((item) => item.topic)).toEqual(['Calculus']);
  });
});
