import { describe, expect, it } from 'vitest';
import { isLikelyIncompletePage, type StructuredForIncompleteCheck } from './incomplete-page-fragment';
import type { CanonicalQuestion } from './extract-normalizer';
import type { QAIssue } from './question-qa';

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

function entry(question: CanonicalQuestion, qaIssues: QAIssue[] = []): StructuredForIncompleteCheck {
  return { question, qaIssues };
}

describe('isLikelyIncompletePage', () => {
  it('is false for empty text', () => {
    expect(isLikelyIncompletePage('', [])).toBe(false);
  });

  it('is false when nothing was found and the leftover text is trivially short', () => {
    expect(isLikelyIncompletePage('12', [])).toBe(false);
  });

  it('is true when nothing was found but there is real leftover text', () => {
    const text = 'and hence the required area is 8 square units, completing the derivation started on the previous page.';
    expect(isLikelyIncompletePage(text, [])).toBe(true);
  });

  it('is false when a single clean question was found with no QA issues', () => {
    expect(isLikelyIncompletePage('Solve for x: 2x + 3 = 7', [entry(q())])).toBe(false);
  });

  it('is true when a single question has an UNBALANCED_MATH QA issue', () => {
    const issues: QAIssue[] = [{ severity: 'error', code: 'UNBALANCED_MATH', message: 'Unbalanced $ math delimiters' }];
    expect(isLikelyIncompletePage('Find $x^2 + 1', [entry(q(), issues)])).toBe(true);
  });

  it('is false when a single question has an unrelated QA issue', () => {
    const issues: QAIssue[] = [{ severity: 'warn', code: 'MISSING_ANSWER', message: 'No answer key set' }];
    expect(isLikelyIncompletePage('Find $x^2 + 1$', [entry(q(), issues)])).toBe(false);
  });

  it('is false when multiple questions were found, even if one has an unbalanced-math issue', () => {
    const issues: QAIssue[] = [{ severity: 'error', code: 'UNBALANCED_MATH', message: 'Unbalanced $ math delimiters' }];
    expect(isLikelyIncompletePage('Q1 ... Q2 ...', [entry(q({ questionContent: 'Q1' })), entry(q({ questionContent: 'Q2' }), issues)])).toBe(false);
  });
});
