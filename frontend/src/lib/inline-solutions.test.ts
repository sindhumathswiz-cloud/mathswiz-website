import { describe, expect, it } from 'vitest';
import { findCaseSubpartSolution, findInlineSolution, parseSubpartNumber, runningFooters, splitTouchingInlineMath, stripRunningFooter } from './inline-solutions';

// Shaped like Xam Idea pp.147-148 as Mathpix reads them: questions start after the previous solution's closing "$",
// and each page ends with its running footer.
const p147 = [
  '15. Differentiate w.r.t$x : y = ( x \\cos x ) ^ { x }$Sol. We have$y = ( x \\cos x ) ^ { x }$so',
  '\\end{array}$16. Find$\\frac { d y } { d x }$if$x = \\frac { \\sin ^ { 3 } t } { \\sqrt { \\cos 2 t } }$',
  'Sol. Given$x = \\frac { \\sin ^ { 3 } t } { \\sqrt { \\cos 2 t } }$Differentiating both sides w.r.t.$t$, we have',
  '\\end{aligned}$17. If$x = \\sqrt { a ^ { \\sin ^ { - 1 } t } }$and$y = \\sqrt { a ^ { \\cos ^ { - 1 } t } }$, show that$\\frac { d y } { d x } = - \\frac { y } { x }$.',
  '[CBSE (AI) 2012]',
  'Sol.$\\begin{array} { l }',
  'x = \\sqrt { a ^ { \\sin ^ { - 1 } t } }',
  '\\end{array}$Continuity and Differentiability 143',
].join('\n');
const p148 = [
  'Multiplying, (i) and (ii) we get$x . y = \\sqrt { a ^ { \\pi / 2 } }$On differentiating both sides, we get$x \\frac { d y } { d x } + y = 0$18. If$y = A e ^ { m x } + B e ^ { n x }$, show that',
  'Sol. Given,$y = A e ^ { m x }$',
  '144 Xam idea Mathematics-XII',
].join('\n');
const pages = [{ pageNumber: 147, text: p147 }, { pageNumber: 148, text: p148 }];
const footers = new Set(['continuity and differentiability', 'xam idea mathematics-xii']);

describe('runningFooters / stripRunningFooter', () => {
  it('finds the footers that recur and strips one from the end of a page, keeping the closing "$"', () => {
    const texts = ['a$Vector Algebra 337', 'b$Vector Algebra 339', 'c\nVector Algebra 341', 'd\n338 Xam idea Mathematics-XII', 'e\nHence the area is 47'];
    expect(runningFooters(texts)).toEqual(new Set(['vector algebra']));
    expect(stripRunningFooter(p147, footers).endsWith('\\end{array}$')).toBe(true);
    expect(stripRunningFooter('Hence the area is 47', new Set(['vector algebra']))).toBe('Hence the area is 47');
  });
});

describe('splitTouchingInlineMath', () => {
  it('splits two inline formulas that touch, and leaves display maths on its own line alone', () => {
    expect(splitTouchingInlineMath('so$x = 1$$\\begin{aligned} y \\end{aligned}$ end')).toBe('so$x = 1$ $\\begin{aligned} y \\end{aligned}$ end');
    expect(splitTouchingInlineMath('Hence\n$$\nx = 1\n$$\ndone')).toBe('Hence\n$$\nx = 1\n$$\ndone');
  });
});

describe('findInlineSolution', () => {
  it('copies the solution printed after a question that starts mid-line', () => {
    const r = findInlineSolution({ pages, startPage: 147, printedNumber: '16', questionContent: 'Find $\\frac{dy}{dx}$ if $x = \\frac{\\sin^3 t}{\\sqrt{\\cos 2t}}$', footers });
    expect(r).toMatchObject({ found: true, startPage: 147, endPage: 147 });
    if (r.found) {
      expect(r.text.startsWith('Given$x')).toBe(true);
      expect(r.text.endsWith('\\end{aligned}$')).toBe(true);
      expect(r.text).not.toMatch(/17\. If/);
    }
  });

  it('follows a solution over the page turn, without the footer, up to the next question', () => {
    const r = findInlineSolution({ pages, startPage: 147, printedNumber: '17', questionContent: 'If $x = \\sqrt{a^{\\sin^{-1} t}}$ and $y = \\sqrt{a^{\\cos^{-1} t}}$, show that $\\frac{dy}{dx} = -\\frac{y}{x}$.', footers });
    expect(r).toMatchObject({ found: true, startPage: 147, endPage: 148 });
    if (r.found) {
      expect(r.text).toMatch(/Multiplying, \(i\) and \(ii\)/);
      expect(r.text).not.toMatch(/Continuity and Differentiability|18\. If/);
    }
  });

  it('refuses a question whose number is on the page but whose text is not', () => {
    expect(findInlineSolution({ pages, startPage: 147, printedNumber: '16', questionContent: 'Define a vector. Give two examples of vector quantities.', footers }))
      .toEqual({ found: false, reason: 'question_not_found' });
  });

  it('stops at a section heading, and says so when a solution never ends in the pages given', () => {
    const withHeading = [{ pageNumber: 10, text: '5. Prove that$x = 1$.\nSol. Since$x = 1$, done.\nMultiple Choice Questions\n1. Which of these' }];
    const r = findInlineSolution({ pages: withHeading, startPage: 10, printedNumber: '5', questionContent: 'Prove that $x = 1$.' });
    expect(r).toMatchObject({ found: true, text: 'Since$x = 1$, done.' });
    const open = [{ pageNumber: 10, text: '5. Prove that$x = 1$.\nSol. Since$x = 1$, and' }];
    expect(findInlineSolution({ pages: open, startPage: 10, printedNumber: '5', questionContent: 'Prove that $x = 1$.' })).toEqual({ found: false, reason: 'no_end_found' });
  });

  it('finds a question whose number runs straight into maths, but not a decimal', () => {
    const tight = [{ pageNumber: 10, text: 'so$x = 2.5$\n4.$y = x ( x - 3 ) ^ { 2 }$decreases for$1 < x < 3$.\nSol. Since$y ^ { \\prime } < 0$there.\n5. Next' }];
    expect(findInlineSolution({ pages: tight, startPage: 10, printedNumber: '4', questionContent: '$y = x (x - 3)^{2}$ decreases for $1 < x < 3$.' }))
      .toMatchObject({ found: true, text: 'Since$y ^ { \\prime } < 0$there.' });
    expect(findInlineSolution({ pages: tight, startPage: 10, printedNumber: '2', questionContent: '$y = x (x - 3)^{2}$ decreases for $1 < x < 3$.' }))
      .toEqual({ found: false, reason: 'question_not_found' });
  });

  it('says when no solution is printed under the question', () => {
    const none = [{ pageNumber: 10, text: '5. Prove that$x = 1$.\n6. Prove that$y = 2$.' }];
    expect(findInlineSolution({ pages: none, startPage: 10, printedNumber: '5', questionContent: 'Prove that $x = 1$.' })).toEqual({ found: false, reason: 'no_solution_printed' });
  });
});

// Shaped like Xam Idea pp.196-197: case 1's parts (i)-(v), then one "Sol." answering each part in turn, a part's
// working sometimes ending inside the maths ("\text { is correct. }\end{array}$(iv)"), then case 2.
const c196 = String.raw`Case-based/Data-based Questions
1. Read the following and answer any four questions from (i) to (v).
A rectangular hall has a fixed perimeter$P$as shown below.
(i) If$x$and$y$represents the length and breadth of the rectangular region, then the relation between the variables is
(a)$x + y = P$(b)$x ^ { 2 } + y ^ { 2 } = P$(c)$2 ( x + y ) = P$(d)$x + 2 y = P$(ii) The area of the rectangular region$A$expressed as a function of$x$is
(a)$P x$(b)$\frac { 1 } { 2 } \left( P x - 2 x ^ { 2 } \right)$(c)$x$(d)$P$(iii) For the largest area the value of$x$should be
(a)$P$(b)$\frac { P } { 2 }$(c)$\frac { 2 P } { 3 }$(d)$\frac { P } { 4 }$Sol. (i) Perimeter of rectangle$= 2 ( x + y )$(ii) by definition. Option (c) is correct.
(ii)$A = x . y = \frac { P x - 2 x ^ { 2 } } { 2 }$∴ Option (b) is correct.
(iii)$\begin{array} { l } \frac { d A } { d x } = 0 \Rightarrow x = \frac { P } { 4 } \\
Application of Derivatives 192`;
const c197 = String.raw`\therefore \text { Option } ( d ) \text { is correct. }
\end{array}$2. Read the following and answer any four questions from (i) to (v).
A window is a rectangle surmounted by a semicircle.
(i) If$x$and$y$represent the length and breadth, the relation is
(a)$x + y = 10$(b)$x + 2 y = 10$(c)$2 x = 10$(d)$y = 10$Sol. (i) Since the perimeter is 10, Option (b) is correct.
3. Next question`;
const casePages = [{ pageNumber: 196, text: c196 }, { pageNumber: 197, text: c197 }];
const caseFooters = new Set(['application of derivatives']);

describe('parseSubpartNumber', () => {
  it('reads a part with or without its case number, and refuses a part of a part', () => {
    expect(parseSubpartNumber('(iii)')).toEqual({ caseNumber: null, part: 'iii' });
    expect(parseSubpartNumber('2(iii)')).toEqual({ caseNumber: '2', part: 'iii' });
    expect(parseSubpartNumber('2.(iv)')).toEqual({ caseNumber: '2', part: 'iv' });
    expect(parseSubpartNumber('v')).toEqual({ caseNumber: null, part: 'v' });
    expect(parseSubpartNumber('(i)(b)')).toBeNull();
  });
});

describe('findCaseSubpartSolution', () => {
  it('copies one part\'s working and its printed answer, not an equation label "(ii)" inside part (i)', () => {
    const r = findCaseSubpartSolution({ pages: casePages, startPage: 196, printedNumber: '(i)', questionContent: 'If $x$ and $y$ represents the length and breadth of the rectangular region, then the relation between the variables is', footers: caseFooters });
    expect(r).toMatchObject({ found: true, answerLetter: 'C', startPage: 196, endPage: 196 });
    if (r.found) expect(r.text).toBe('Perimeter of rectangle$= 2 ( x + y )$(ii) by definition. Option (c) is correct.');
    const two = findCaseSubpartSolution({ pages: casePages, startPage: 196, printedNumber: '(ii)', questionContent: 'The area of the rectangular region $A$ expressed as a function of $x$ is', footers: caseFooters });
    expect(two).toMatchObject({ found: true, answerLetter: 'B' });
    if (two.found) expect(two.text.startsWith('$A = x . y')).toBe(true);
  });

  it('keeps a part whose answer line ends inside the maths whole, over the page turn, and stops at the next case', () => {
    const r = findCaseSubpartSolution({ pages: casePages, startPage: 196, printedNumber: '1(iii)', questionContent: 'For the largest area the value of $x$ should be', footers: caseFooters });
    expect(r).toMatchObject({ found: true, answerLetter: 'D', startPage: 196, endPage: 197 });
    if (r.found) {
      expect(r.text.endsWith(String.raw`\end{array}$`)).toBe(true);
      expect(r.text).not.toMatch(/Application of Derivatives|Read the following/);
    }
  });

  it('refuses a part whose case number does not match the case it sits under', () => {
    expect(findCaseSubpartSolution({ pages: casePages, startPage: 196, printedNumber: '2(iii)', questionContent: 'For the largest area the value of $x$ should be', footers: caseFooters }))
      .toEqual({ found: false, reason: 'question_not_found' });
  });

  it('is what findInlineSolution uses for a sub-part number, so a whole case\'s solution never goes to one part', () => {
    const r = findInlineSolution({ pages: [{ pageNumber: 197, text: c197 }], startPage: 197, printedNumber: '2(i)', questionContent: 'If $x$ and $y$ represent the length and breadth, the relation is' });
    expect(r).toMatchObject({ found: true, answerLetter: 'B', text: 'Since the perimeter is 10, Option (b) is correct.' });
    expect(findInlineSolution({ pages: casePages, startPage: 196, printedNumber: '(i)(b)', questionContent: 'x' })).toEqual({ found: false, reason: 'unsupported_number' });
  });
});
