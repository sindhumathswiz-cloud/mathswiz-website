import { describe, expect, it } from 'vitest';
import { approvalReadiness, type ReadinessQuestion } from './approval-readiness';

const solution = 'Perimeter of the rectangle is $2(x + y) = P$, so the relation is $2(x+y) = P$. Option (c) is correct.';
const ready: ReadinessQuestion = {
  content: 'If $x$ and $y$ are the length and breadth, then the relation between them is',
  options: ['$x + y = P$', '$x^2 + y^2 = P$', '$2(x + y) = P$', '$x + 2y = P$'],
  correctAnswer: 'C',
  explanation: solution,
  type: 'SINGLE_CHOICE',
  tags: ['Solution from page text'],
  topic: 'Application of Derivatives',
  difficulty: 'MEDIUM',
  bookId: 'book-1',
  bookChapterId: 'ch-1',
  sourcePageStart: 196,
  printedNumber: '(i)',
  verificationStatus: 'STRUCTURALLY_VALID',
};

describe('approvalReadiness', () => {
  it('passes a tagged, answered question with a real worked solution', () => {
    expect(approvalReadiness(ready)).toEqual([]);
  });

  it('passes a written question whose answer is the end of its worked solution', () => {
    expect(approvalReadiness({ ...ready, type: 'SUBJECTIVE', options: [], correctAnswer: null, explanation: 'Let $f(x) = x^2$. Then $f\'(x) = 2x > 0$ for $x > 0$, so $f$ is increasing on $(0, \\infty)$.' })).toEqual([]);
  });

  it('holds back a multiple-choice question without an answer, or without a solution', () => {
    expect(approvalReadiness({ ...ready, correctAnswer: null })).toContain('qa:MISSING_ANSWER');
    expect(approvalReadiness({ ...ready, explanation: null })).toContain('qa:MISSING_EXPLANATION');
  });

  it('holds back a bare answer passed off as a solution, and a solution that names another option', () => {
    expect(approvalReadiness({ ...ready, explanation: 'Option (c) is correct.' })).toContain('solution_too_short');
    expect(approvalReadiness({ ...ready, correctAnswer: 'B' })).toContain('answer_solution_disagree');
  });

  it('holds back anything flagged for a person, untagged, or without its source', () => {
    expect(approvalReadiness({ ...ready, tags: ['Check Against Page'] })).toContain('tag:Check Against Page');
    expect(approvalReadiness({ ...ready, verificationStatus: 'NEEDS_REVIEW' })).toContain('status:NEEDS_REVIEW');
    expect(approvalReadiness({ ...ready, bookChapterId: null })).toContain('no_chapter');
    expect(approvalReadiness({ ...ready, difficulty: null })).toContain('no_difficulty');
    expect(approvalReadiness({ ...ready, printedNumber: null })).toContain('no_source');
  });

  it('holds back a solution whose maths will not render', () => {
    expect(approvalReadiness({ ...ready, explanation: `${solution} $\\frac{1}{$` })).toEqual(expect.arrayContaining([expect.stringMatching(/^qa:(LATEX_RENDER|UNBALANCED_MATH)$/)]));
  });
});
