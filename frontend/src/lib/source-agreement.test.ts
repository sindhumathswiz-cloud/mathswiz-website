import { describe, expect, it } from 'vitest';
import { notOnPageNote, sourceAgreement, SOURCE_AGREEMENT_THRESHOLD } from './source-agreement';

const page = 'Selected NCERT Questions 1. Show that the function $f$ defined by $f ( x ) = | 1 - x + | x | |$, where $x$ is any real number, is a continuous function. Sol. Let g(x) = 1 - x + |x| ...';

describe('sourceAgreement', () => {
  it('finds a transcribed question on its page, whatever the LaTeX spacing', () => {
    expect(sourceAgreement('Show that the function $f$ defined by $f(x) = |1 - x + |x||$, where $x$ is any real number, is a continuous function.', page)).toBeGreaterThanOrEqual(SOURCE_AGREEMENT_THRESHOLD);
  });

  it('does not find a question made up from theory', () => {
    expect(sourceAgreement('Define a vector. Give two examples of vector quantities.', page)).toBeLessThan(SOURCE_AGREEMENT_THRESHOLD);
  });

  it('treats an empty question as nothing to check', () => {
    expect(sourceAgreement('', page)).toBe(1);
  });

  it('says how much matched', () => {
    expect(notOnPageNote(0.47)).toMatch(/^Only 47% of this question's text is on its page/);
  });
});
