import { describe, expect, it } from 'vitest';
import { answerFromSolution, splitInlineOptions } from './choice-recovery';

describe('splitInlineOptions', () => {
  it('moves inline (a)-(d) options out of the question text, losing nothing', () => {
    const result = splitInlineOptions('The integrating factor of$\\frac{d y}{d x}+y=2$is [NCERT Exemplar]\n(a)$e^{x}$(b)$\\log x$(c)$\\log (\\log x)$(d)$x$');
    expect(result).toEqual({
      stem: 'The integrating factor of$\\frac{d y}{d x}+y=2$is [NCERT Exemplar]',
      options: ['$e^{x}$', '$\\log x$', '$\\log (\\log x)$', '$x$'],
    });
  });

  it('keeps plain-text options, including a bare number', () => {
    expect(splitInlineOptions('The order of the equation is (a) 1 (b) 2 (c) 3 (d) 4')?.options).toEqual(['1', '2', '3', '4']);
  });

  it('does nothing when the labels are out of order, too few, or there is no question before them', () => {
    expect(splitInlineOptions('Find x (b) 2 (a) 1')).toBeNull();
    expect(splitInlineOptions('Find x (a) 1 (b) 2')).toBeNull();
    expect(splitInlineOptions('(a) 1 (b) 2 (c) 3 (d) 4')).toBeNull();
    expect(splitInlineOptions('No options here at all.')).toBeNull();
  });

  it('refuses an option that would be empty rather than guess', () => {
    expect(splitInlineOptions('Pick one (a) (b) 2 (c) 3')).toBeNull();
  });
});

describe('answerFromSolution', () => {
  const options = ['$\\frac{e^{b y}}{b}=\\frac{e^{a x}}{a}+C$', '$\\frac{e^{-b y}}{-b}=\\frac{e^{a x}}{a}+C$', '$\\frac{e^{-b y}}{a}=\\frac{e^{a x}}{a}+C$', '4'];

  it('takes the letter of the one option the printed solution ends with', () => {
    const explanation = 'Given$\\log y=a x$. Integrating, we get$$\\frac{e^{-b y}}{-b}=\\frac{e^{a x}}{a}+C$$';
    expect(answerFromSolution(options, explanation)).toBe('B');
  });

  it('ignores spacing and sizing commands when comparing', () => {
    expect(answerFromSolution(['$x^{2}+1$', '$x^{2}-1$'], 'So the answer is $$\\left( x^{2}-1 \\right)$$'.replace('\\left( ', '').replace(' \\right)', ''))).toBe('B');
  });

  it('reads the part after the last equals sign, so "y = 2x" matches an option "2x"', () => {
    expect(answerFromSolution(['$2 x$', '$x+2$', '$x$'], 'Hence $$y=2 x$$')).toBe('A');
  });

  it('gives no answer when nothing matches, when two options match, or when the solution is not about this question', () => {
    expect(answerFromSolution(options, 'We get $$\\frac{1}{2}$$')).toBeNull();
    expect(answerFromSolution(['$x$', '$x$', '$y$'], 'So $$x$$')).toBeNull();
    expect(answerFromSolution(options, 'Find the particular solution... $$y=1$$')).toBeNull();
    expect(answerFromSolution(options, 'No maths in this working.')).toBeNull();
    expect(answerFromSolution(['$x$'], 'So $$x$$')).toBeNull();
  });

  it('is not fooled by braces or backslashes that change the meaning', () => {
    // \frac{1}{2x} and \frac{1}{2}x are different answers and must not be treated as the same.
    expect(answerFromSolution(['$\\frac{1}{2}x$', '$\\frac{1}{2x}$'], 'So $$\\frac{1}{2x}$$')).toBe('B');
    expect(answerFromSolution(['$\\frac{1}{2}x$', '$3$'], 'So $$\\frac{1}{2x}$$')).toBeNull();
  });
});
