import { describe, expect, it } from 'vitest';
import { fitWithin } from './image-downscale';

describe('fitWithin', () => {
  it('leaves a photo that already fits alone', () => {
    expect(fitWithin(1200, 900)).toEqual({ width: 1200, height: 900, scaled: false });
    expect(fitWithin(1600, 1600)).toEqual({ width: 1600, height: 1600, scaled: false });
  });

  it('scales the long side down to the limit and keeps the proportions', () => {
    expect(fitWithin(4000, 3000)).toEqual({ width: 1600, height: 1200, scaled: true });
    expect(fitWithin(3000, 4000)).toEqual({ width: 1200, height: 1600, scaled: true });
    expect(fitWithin(8000, 100)).toEqual({ width: 1600, height: 20, scaled: true });
  });

  it('never produces a zero-sized image and ignores nonsense sizes', () => {
    expect(fitWithin(100000, 10).height).toBeGreaterThanOrEqual(1);
    expect(fitWithin(0, 0)).toEqual({ width: 0, height: 0, scaled: false });
    expect(fitWithin(NaN, 5)).toMatchObject({ scaled: false });
  });
});
