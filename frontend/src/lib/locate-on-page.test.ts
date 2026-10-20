import { describe, expect, it } from 'vitest';
import { locateOnPage } from './locate-on-page';

const line = (y: number, text: string) => ({ y, h: 0.02, text });
const page = [
  line(0.05, 'RELATIONS 1.3'),
  line(0.12, 'Illustration 2 Let A be a non-void set and let R be a relation defined on A by'),
  line(0.2, 'Let L be the set of all lines in a plane. Then relation R on L defined by (L1, L2) in R'),
  line(0.26, 'if L1 is parallel to L2 is reflexive, since every line is parallel to itself.'),
  line(0.4, 'Illustration 6 Let L be the set of all lines in a plane. Then relation R on L defined by'),
  line(0.9, '1.3.3 SYMMETRIC RELATION'),
];

describe('locateOnPage', () => {
  it('finds the line where the question starts, whatever tags or numbering the stored text has', () => {
    const hit = locateOnPage(page, '3. Let $L$ be the set of all lines in a plane. Then relation $R$ on $L$ defined by [CBSE 2014]');
    expect(hit).not.toBeNull();
    expect(hit!.line).toBe(2);
    expect(hit!.y).toBe(0.2);
    expect(hit!.score).toBeGreaterThan(0.8);
  });

  it('prefers the higher line when two match equally, since a question starts above its working', () => {
    const duplicated = [line(0.5, 'Find the area bounded by the parabola and the line'), line(0.1, 'Find the area bounded by the parabola and the line')];
    expect(locateOnPage(duplicated, 'Find the area bounded by the parabola and the line x = 4')!.y).toBe(0.1);
  });

  it('says nothing rather than guess when nothing on the page resembles the question', () => {
    expect(locateOnPage(page, 'Evaluate the definite integral of sine from zero to pi over two')).toBeNull();
    expect(locateOnPage([], 'Anything at all that is long enough')).toBeNull();
  });

  it('ignores very short lines and very short questions', () => {
    expect(locateOnPage([line(0.1, 'Q1'), line(0.2, 'ok')], 'Q1 ok')).toBeNull();
    expect(locateOnPage(page, 'Let')).toBeNull();
  });
});
