import { describe, expect, it } from 'vitest';
import { batchPages, buildRevisionPrompt, flashcardFromItem, groupByKind, isNearDuplicate, withUniqueFronts, locateInPages, mathIsBalanced, normalizeForMatch, parseRevisionItems, spaceMathBoundaries, verbatimScore, verbatimTier, VERBATIM_CLOSE } from './revision-content';
import { revisionContentHash } from './revision-hash';

const reply = (items: unknown[]) => JSON.stringify({ items });

describe('parseRevisionItems', () => {
  const good = { kind: 'THEOREM', title: "Rolle's Theorem", body: 'If $f$ is continuous on $[a,b]$ then there is $c$ with $f\'(c)=0$.', sourcePage: 150 };

  it('keeps well-formed items', () => {
    expect(parseRevisionItems(reply([good]), [149, 150])).toEqual([good]);
  });

  it('accepts a loosely written kind and a bare array', () => {
    const loose = { ...good, kind: 'key point' };
    expect(parseRevisionItems(JSON.stringify([loose]), [150])[0].kind).toBe('KEY_POINT');
  });

  it('drops unknown kinds, empty or tiny bodies, missing titles and pages that were not in the request', () => {
    const bad = [
      { ...good, kind: 'EXAMPLE' },
      { ...good, body: '  ' },
      { ...good, body: 'x' },
      { ...good, title: '' },
      { ...good, sourcePage: 999 },
      { ...good, sourcePage: 'abc' },
      null,
      'text',
    ];
    expect(parseRevisionItems(reply([...bad, good]), [150])).toEqual([good]);
  });

  it('returns nothing for unparseable or empty replies', () => {
    expect(parseRevisionItems('not json at all', [1])).toEqual([]);
    expect(parseRevisionItems('', [1])).toEqual([]);
    expect(parseRevisionItems(null, [1])).toEqual([]);
    expect(parseRevisionItems(reply([]), [1])).toEqual([]);
  });

  it('caps runaway lengths', () => {
    const [item] = parseRevisionItems(reply([{ ...good, body: 'a'.repeat(9000), title: 't'.repeat(500) }]), [150]);
    expect(item.body.length).toBeLessThanOrEqual(2400);
    expect(item.title.length).toBeLessThanOrEqual(140);
  });
});

describe('verbatimScore', () => {
  const page = 'Definition. A function f is continuous at x = c if \\(\\lim_{x \\to c} f(x) = f(c)\\). Example 3. Find the derivative of x^2.';

  it('is 1 for text that is on the page, whatever the LaTeX delimiters, spacing or braces', () => {
    expect(verbatimScore('A function $f$ is continuous at $x=c$ if $\\lim_{x\\to c}f(x)=f(c)$.', page)).toBe(1);
    expect(verbatimScore('a function f is continuous at x = c', page)).toBe(1);
  });

  it('scores a paraphrase well below the pass mark', () => {
    const paraphrase = 'Continuity at a point means the limit of the function there equals its value at that point.';
    expect(verbatimScore(paraphrase, page)).toBeLessThan(VERBATIM_CLOSE);
  });

  it('scores invented content near zero', () => {
    expect(verbatimScore('The derivative of sin x is cos x for every real number x.', page)).toBeLessThan(0.3);
  });

  it('catches a copy with one altered formula', () => {
    const altered = 'A function f is continuous at x = c if \\lim_{x \\to c} f(x) = f(c) + 1. Example 3 holds.';
    expect(verbatimScore(altered, page)).toBeLessThan(1);
  });

  it('is 0 when either side is empty', () => {
    expect(verbatimScore('', page)).toBe(0);
    expect(verbatimScore('something', '')).toBe(0);
  });
});

describe('verbatimTier', () => {
  const page = 'Formula. The derivative of the product is given by $\\frac{d}{dx}(uv) = u\\frac{dv}{dx} + v\\frac{du}{dx}$ where u and v are differentiable functions of x on the interval.';

  it('treats \\dfrac and \\frac as the same', () => {
    expect(verbatimTier(verbatimScore('$\\dfrac{d}{dx}(uv) = u\\dfrac{dv}{dx} + v\\dfrac{du}{dx}$', page))).toBe('EXACT');
  });

  it('does NOT trust a copy with one changed symbol, even though it shares almost all of its text', () => {
    const wrongSign = '$\\frac{d}{dx}(uv) = u\\frac{dv}{dx} - v\\frac{du}{dx}$ where u and v are differentiable functions of x on the interval.';
    const score = verbatimScore(wrongSign, page);
    expect(score).toBeGreaterThan(0.8);
    expect(verbatimTier(score)).not.toBe('EXACT');
  });

  it('bands scores', () => {
    expect(verbatimTier(1)).toBe('EXACT');
    expect(verbatimTier(0.95)).toBe('CLOSE');
    expect(verbatimTier(0.5)).toBe('MISMATCH');
    expect(verbatimTier(null)).toBe('MISMATCH');
  });
});

describe('normalizeForMatch / revisionContentHash', () => {
  it('ignores delimiters, whitespace, braces and case', () => {
    expect(normalizeForMatch('$$ \\frac{A}{B} $$')).toBe(normalizeForMatch('\\frac A B'.replace('A', '{A}')));
  });

  it('gives the same hash to the same content written two ways, and different hashes to different content', () => {
    expect(revisionContentHash('$x^{2}+1$')).toBe(revisionContentHash('x^2 + 1'.replace('^2', '^{2}')));
    expect(revisionContentHash('$x^2+1$')).not.toBe(revisionContentHash('$x^2+2$'));
  });
});

describe('flashcardFromItem', () => {
  const body = 'The text exactly as printed in the book.';
  it('asks for the item and answers with the book\'s own text, untouched', () => {
    expect(flashcardFromItem({ kind: 'DEFINITION', title: 'Continuity', body })).toEqual({ front: 'Define: Continuity', back: body });
    expect(flashcardFromItem({ kind: 'THEOREM', title: "Rolle's Theorem", body }).front).toBe("State: Rolle's Theorem");
    expect(flashcardFromItem({ kind: 'FORMULA', title: 'Product rule', body }).front).toBe('Write the formula: Product rule');
    expect(flashcardFromItem({ kind: 'PROPERTY', title: 'Det of a transpose', body }).front).toBe('Recall the property: Det of a transpose');
    expect(flashcardFromItem({ kind: 'KEY_POINT', title: 'Remember this', body }).front).toBe('Remember this');
    for (const kind of ['DEFINITION', 'THEOREM', 'FORMULA', 'PROPERTY', 'KEY_POINT'] as const) {
      expect(flashcardFromItem({ kind, title: 't', body }).back).toBe(body);
    }
  });
});

describe('groupByKind / batchPages / buildRevisionPrompt', () => {
  it('groups in a fixed teaching order and omits empty groups', () => {
    const groups = groupByKind([{ kind: 'FORMULA' }, { kind: 'DEFINITION' }, { kind: 'FORMULA' }] as Array<{ kind: 'FORMULA' | 'DEFINITION' }>);
    expect(groups.map(g => [g.label, g.items.length])).toEqual([['Definitions', 1], ['Formulas', 2]]);
  });

  it('batches by size and page count without splitting a page', () => {
    const pages = Array.from({ length: 10 }, (_, i) => ({ pageNumber: i + 1, text: 'x'.repeat(3000) }));
    const batches = batchPages(pages, 7000, 6);
    expect(batches.map(b => b.length)).toEqual([2, 2, 2, 2, 2]);
    expect(batches.flat().map(p => p.pageNumber)).toEqual(pages.map(p => p.pageNumber));
    expect(batchPages([{ pageNumber: 1, text: 'y'.repeat(50000) }])).toHaveLength(1);
  });

  it('marks every page in the request and forbids paraphrase', () => {
    const { system, user } = buildRevisionPrompt([{ pageNumber: 12, text: 'Definition ...' }, { pageNumber: 13, text: 'Theorem ...' }]);
    expect(user).toContain('=== PAGE 12 ===');
    expect(user).toContain('=== PAGE 13 ===');
    expect(system).toMatch(/COPIED EXACTLY/);
    expect(system).toMatch(/never write, complete, correct/i);
  });
});

describe('spaceMathBoundaries', () => {
  it('puts a space between words and the math that touches them, changing nothing else', () => {
    expect(spaceMathBoundaries('A function$f(x)$is continuous$\\;$if')).toBe('A function $f(x)$ is continuous $\\;$ if');
    expect(spaceMathBoundaries('where$k$is a constant')).toBe('where $k$ is a constant');
  });

  it('leaves already-spaced text, punctuation and display math alone', () => {
    expect(spaceMathBoundaries('A function $f$ is continuous.')).toBe('A function $f$ is continuous.');
    expect(spaceMathBoundaries('Then $x=1$, $y=2$.')).toBe('Then $x=1$, $y=2$.');
    expect(spaceMathBoundaries('($x$)')).toBe('($x$)');
    expect(spaceMathBoundaries('Hence$$x^2=1$$and')).toBe('Hence $$x^2=1$$ and');
  });

  it('never alters what is inside a math span, and keeps escaped dollars', () => {
    expect(spaceMathBoundaries('a$b+c$d')).toBe('a $b+c$ d');
    expect(spaceMathBoundaries('costs \\$5 for$x$units')).toBe('costs \\$5 for $x$ units');
    expect(spaceMathBoundaries('$x$')).toBe('$x$');
    expect(spaceMathBoundaries('')).toBe('');
  });

  it('keeps every non-space character in the same order', () => {
    const input = 'The set$A\\cup B$contains$x$if$x\\in A$or$x\\in B$.';
    const squash = (t: string) => t.replace(/\s/g, '');
    expect(squash(spaceMathBoundaries(input))).toBe(squash(input));
  });
});

describe('locateInPages', () => {
  const pages = [
    { pageNumber: 225, text: 'Antiderivative. A function phi is an antiderivative of f if phi prime equals f on the interval.' },
    { pageNumber: 226, text: 'Substitution formulas: (i) $\int (ax+b)^n dx = \frac{(ax+b)^{n+1}}{a(n+1)} + C$ (ii) $\int \frac{1}{ax+b} dx = \frac{1}{a}\log|ax+b| + C$ and then the page ends here' },
    { pageNumber: 227, text: 'Next page continues: (iii) $\int e^{ax+b} dx = \frac{1}{a}e^{ax+b} + C$ for every real a not zero.' },
  ];

  it('keeps the claimed page when the text is on it', () => {
    expect(locateInPages('A function phi is an antiderivative of f', pages, 225)).toEqual({ sourcePage: 225, score: 1 });
  });

  it('moves an item to the page it is really on, instead of calling it invented', () => {
    const body = '(i) $\int (ax+b)^n dx = \frac{(ax+b)^{n+1}}{a(n+1)} + C$ (ii) $\int \frac{1}{ax+b} dx = \frac{1}{a}\log|ax+b| + C$';
    expect(locateInPages(body, pages, 225)).toEqual({ sourcePage: 226, score: 1 });
  });

  it('finds a copy that runs across a page break, attributed to the page it starts on', () => {
    const across = 'the page ends here Next page continues: (iii) $\int e^{ax+b} dx = \frac{1}{a}e^{ax+b} + C$';
    const found = locateInPages(across, pages, 226);
    expect(found.score).toBe(1);
  });

  it('still scores invented text low, wherever it claims to be', () => {
    expect(locateInPages('The integral of tan x is always equal to zero for every real number.', pages, 226).score).toBeLessThan(0.5);
    expect(locateInPages('anything at all here', pages, 999).score).toBeLessThan(0.5);
  });
});

describe('mathIsBalanced', () => {
  it('detects an unclosed math span and ignores escaped dollars', () => {
    expect(mathIsBalanced('If $k$ is a constant then $\int k f(x) dx')).toBe(false);
    expect(mathIsBalanced('If $k$ is constant then $\int k f(x) dx$')).toBe(true);
    expect(mathIsBalanced('It costs \\$5 and $x$ is a number')).toBe(true);
    expect(mathIsBalanced('plain text')).toBe(true);
  });
});

describe('isNearDuplicate', () => {
  const saved = ['Antiderivative (or Primitive): A function phi(x) is said to be an antiderivative of f(x) if phi prime equals f'];

  it('catches the same passage trimmed, extended or re-spaced', () => {
    expect(isNearDuplicate('A function phi(x) is said to be an antiderivative of f(x) if phi prime equals f', saved)).toBe(true);
    expect(isNearDuplicate('Antiderivative (or Primitive): A function phi(x) is said to be an antiderivative of f(x) if phi prime equals f, i.e. more.', saved)).toBe(true);
    expect(isNearDuplicate('A function  phi(x)  is said to be an  antiderivative of f(x) if phi prime equals f', saved)).toBe(true);
  });

  it('keeps different passages, and does not let a short item be swallowed by a long one', () => {
    expect(isNearDuplicate('The indefinite integral is the family of all antiderivatives of a function.', saved)).toBe(false);
    expect(isNearDuplicate('f prime', ['This long passage mentions f prime somewhere in the middle of the sentence here.'])).toBe(false);
    expect(isNearDuplicate('x', [])).toBe(false);
  });
});

describe('withUniqueFronts', () => {
  it('leaves distinct fronts alone and tells repeated ones apart by page, then number', () => {
    const cards = [
      { front: 'Define: Continuity', sourcePage: 3 },
      { front: 'Write the formula: Standard integrals', sourcePage: 4 },
      { front: 'Write the formula: Standard integrals', sourcePage: 5 },
      { front: 'Write the formula: Standard integrals', sourcePage: 5 },
    ];
    expect(withUniqueFronts(cards).map(c => c.front)).toEqual([
      'Define: Continuity',
      'Write the formula: Standard integrals (p. 4)',
      'Write the formula: Standard integrals (p. 5) #1',
      'Write the formula: Standard integrals (p. 5) #2',
    ]);
    expect(new Set(withUniqueFronts(cards).map(c => c.front)).size).toBe(4);
  });
});
