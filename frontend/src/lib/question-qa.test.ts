import { describe, it, expect } from 'vitest';
import { analyzeQuestion, worstSeverity } from './question-qa';

const codes = (q: Parameters<typeof analyzeQuestion>[0]) => analyzeQuestion(q).map((i) => i.code);

describe('analyzeQuestion', () => {
  it('passes a clean MCQ', () => {
    expect(analyzeQuestion({
      content: 'What is $2+2$?',
      options: ['$3$', '$4$', '$5$', '$6$'],
      correctAnswer: 'B',
      explanation: 'Adding $2+2$ gives $4$, which is option B.',
      type: 'SINGLE_CHOICE',
    })).toEqual([]);
  });

  it('flags an MCQ with options but no explanation', () => {
    expect(codes({
      content: 'What is $2+2$?',
      options: ['$3$', '$4$', '$5$', '$6$'],
      correctAnswer: 'B',
      type: 'SINGLE_CHOICE',
    })).toContain('MISSING_EXPLANATION');
  });

  it('passes a clean subjective question with no answer', () => {
    expect(analyzeQuestion({
      content: 'Prove that $\\sqrt{2}$ is irrational.',
      type: 'LONG_ANSWER',
    })).toEqual([]);
  });

  it('flags empty content', () => {
    expect(codes({ content: '', type: 'SUBJECTIVE' })).toContain('EMPTY_CONTENT');
  });

  it('flags unbalanced $ delimiters', () => {
    expect(codes({ content: 'Find the value of $x + 1', type: 'SUBJECTIVE' })).toContain('UNBALANCED_MATH');
  });

  it('flags LaTeX that will not render', () => {
    // unbalanced brace — not something the sanitizer can repair
    expect(codes({ content: 'Compute $$\\frac{1}{2$$ now.', type: 'SUBJECTIVE' })).toContain('LATEX_RENDER');
  });

  it('does NOT flag valid aligned/matrix LaTeX (after sanitize)', () => {
    const c = codes({
      content: 'Solve: $$\\begin{aligned} x+y &= 2 \\\\ x-y &= 0 \\end{aligned}$$',
      type: 'SUBJECTIVE',
    });
    expect(c).not.toContain('LATEX_RENDER');
    expect(c).not.toContain('UNBALANCED_MATH');
  });

  it('flags MCQ with too few options', () => {
    expect(codes({ content: 'Pick one valid answer here', options: ['only one'], type: 'SINGLE_CHOICE' }))
      .toContain('MISSING_OPTIONS');
  });

  it('flags a missing answer on an objective question', () => {
    expect(codes({ content: 'What is $2+2$?', options: ['$3$', '$4$'], correctAnswer: '', type: 'SINGLE_CHOICE' }))
      .toContain('MISSING_ANSWER');
  });

  it('flags an answer letter pointing to a non-existent option', () => {
    expect(codes({ content: 'What is $2+2$?', options: ['$3$', '$4$'], correctAnswer: 'D', type: 'SINGLE_CHOICE' }))
      .toContain('BAD_ANSWER_OPTION');
  });

  it('flags a text answer that matches no option', () => {
    expect(codes({ content: 'What is $2+2$?', options: ['$3$', '$4$'], correctAnswer: '$99$', type: 'SINGLE_CHOICE' }))
      .toContain('ANSWER_NOT_IN_OPTIONS');
  });

  it('flags missing premise data (matrix referenced but absent)', () => {
    expect(codes({ content: 'For the given matrix $A$, find $|A|$.', type: 'SUBJECTIVE' }))
      .toContain('MISSING_DATA');
  });

  it('flags OCR garble', () => {
    expect(codes({ content: 'Find x � y value here', type: 'SUBJECTIVE' })).toContain('OCR_GARBLE');
  });
});

describe('worstSeverity', () => {
  it('returns error > warn > null', () => {
    expect(worstSeverity([{ severity: 'warn', code: 'X', message: '' }, { severity: 'error', code: 'Y', message: '' }])).toBe('error');
    expect(worstSeverity([{ severity: 'warn', code: 'X', message: '' }])).toBe('warn');
    expect(worstSeverity([])).toBeNull();
  });
});
