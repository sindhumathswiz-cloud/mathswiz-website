import { describe, expect, it } from 'vitest';
import { isLikelyCaseStudyFragment } from './case-study-fragment';
import type { CanonicalQuestion } from './extract-normalizer';

function q(overrides: Partial<CanonicalQuestion> = {}): CanonicalQuestion {
  return {
    questionContent: 'Some question content',
    type: 'SUBJECTIVE',
    difficulty: 'MEDIUM',
    options: [],
    correctAnswer: '',
    explanation: '',
    explanationType: 'NONE',
    tags: [],
    topic: '',
    method: '',
    printedNumber: '',
    ...overrides,
  };
}

describe('isLikelyCaseStudyFragment', () => {
  it('is false for ordinary pages with no case-study language', () => {
    expect(isLikelyCaseStudyFragment('Solve for x: 2x + 3 = 7', [q()])).toBe(false);
  });

  it('is false for empty text', () => {
    expect(isLikelyCaseStudyFragment('', [])).toBe(false);
  });

  it('is true when a case-study intro page produced zero questions', () => {
    const text = 'Read the following and answer any four questions from (i) to (v).\n\nA general election of Lok Sabha is a gigantic exercise...';
    expect(isLikelyCaseStudyFragment(text, [])).toBe(true);
  });

  it('is true when the LLM echoed the bare passage back as one question with no explanation and no sub-parts', () => {
    const text = 'Based on the above information, a relation R is defined on I as follows...';
    const questions = [q({ questionContent: 'A relation R is defined on I as follows...', explanation: '' })];
    expect(isLikelyCaseStudyFragment(text, questions)).toBe(true);
  });

  it('is false once the page has real sub-questions with (i)/(ii) markers, even without an explanation yet', () => {
    const text = 'Based on the above information, answer the following questions:\n(i) ...\n(ii) ...';
    const questions = [q({ questionContent: '(i) Which of the following is true?\n(ii) Which of the following is true?', explanation: '' })];
    expect(isLikelyCaseStudyFragment(text, questions)).toBe(false);
  });

  it('is false once the page has a real question with a worked explanation', () => {
    const text = 'Case study: read the following passage...';
    const questions = [q({ questionContent: 'What is the value of x?', explanation: 'x = 5 because...' })];
    expect(isLikelyCaseStudyFragment(text, questions)).toBe(false);
  });

  it('is false when structuring found multiple questions on the page', () => {
    const text = 'Read the following and answer the questions below.';
    const questions = [q({ questionContent: 'Q1' }), q({ questionContent: 'Q2' })];
    expect(isLikelyCaseStudyFragment(text, questions)).toBe(false);
  });
});
