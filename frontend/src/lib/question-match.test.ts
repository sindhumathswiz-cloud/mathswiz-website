import { describe, expect, it } from 'vitest';
import { MatchIndex, compactForMatch, dice, gramsOf, sameNumbers, toMatchable } from './question-match';

describe('compactForMatch', () => {
  it('ignores spacing, source tags, numbering and LaTeX sizing, but keeps the mathematics', () => {
    const a = compactForMatch('12. Find $\\frac{d y}{d x}$ if $y = \\sin ^{2} x$ [CBSE 2014]');
    const b = compactForMatch('Find $\\frac{dy}{dx}$ if $y=\\sin^2 x$');
    expect(a.replace(/2/g, '')).toBe(b.replace(/2/g, ''));
    expect(a).toContain('fracdydx');
  });

  it('keeps the symbols that change a question\'s meaning', () => {
    expect(compactForMatch('$x+1=2$')).not.toBe(compactForMatch('$x-1=2$'));
    expect(compactForMatch('$a<b$')).not.toBe(compactForMatch('$a>b$'));
  });
});

describe('dice', () => {
  it('is 1 for the same text, 0 for unrelated text, and high for a near copy', () => {
    const a = gramsOf(compactForMatch('The probability that Hari hits a target is one fourth, he fires 64 times'));
    expect(dice(a, a)).toBe(1);
    expect(dice(a, gramsOf(compactForMatch('Evaluate the integral of sin x over zero to pi')))).toBeLessThan(0.2);
    const near = gramsOf(compactForMatch('The probability that Hari hits a target is one fourth. He fires 64 times!'));
    expect(dice(a, near)).toBeGreaterThan(0.95);
    expect(dice(new Set(), a)).toBe(0);
  });
});

describe('MatchIndex', () => {
  const pool = [
    toMatchable('p1', 'The integrating factor of the differential equation $\\frac{d y}{d x}(x \\log x)+y=2 \\log x$ is'),
    toMatchable('p2', 'Find the area bounded by the parabola $y^{2}=x$ and the straight line $2y=x$ using integration'),
    toMatchable('p3', 'If A is an invertible matrix of order 3 and |A| = 7, then find the value of |A^-1| as a fraction'),
  ];
  const index = new MatchIndex(pool);

  it('finds the same question typed differently, and says which', () => {
    const query = toMatchable('q', '4. The integrating factor of the differential equation $\\frac{dy}{dx}(x\\log x)+y=2\\log x$ is [NCERT Exemplar]');
    const hit = index.best(query, 0.9);
    expect(hit?.entry.id).toBe('p1');
    expect(hit!.score).toBeGreaterThan(0.9);
  });

  it('does not match a different question, a too-short one, or itself', () => {
    expect(index.best(toMatchable('q', 'Find the area bounded by the parabola $y^{2}=x$ and the line $x=4$ using integration'), 0.9)).toBeNull();
    expect(index.best(toMatchable('q', 'Find x'), 0.5)).toBeNull();
    expect(index.best(pool[1], 0.9, 'p2')).toBeNull();
  });
});

describe('sameNumbers', () => {
  it('treats formatting differences as the same and any real difference as a different question', () => {
    expect(sameNumbers('In a town of 10,000 families, 40% buy A', 'In a town of 10000 families, 40% buy A')).toBe(true);
    expect(sameNumbers('12. If $P(A)=0.4$ and $P(B)=0.3$ [CBSE 2014]', 'If $P(A)=0.4$ and $P(B)=0.3$')).toBe(true);
    expect(sameNumbers('If $P(A)=0.4$', 'If $P(A)=0.5$')).toBe(false);
    expect(sameNumbers('There are 4 cards numbered 1 to 4', 'There are 4 cards numbered 1 to 4 and 7 more')).toBe(false);
    expect(sameNumbers('No numbers here', 'None here either')).toBe(true);
  });
});
