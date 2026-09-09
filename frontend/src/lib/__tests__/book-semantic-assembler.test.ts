import { describe, expect, it } from 'vitest';
import { assembleOcrPage } from '../book-semantic-assembler';

describe('assembleOcrPage', () => {
  it('groups a question, options, answer, and solution with provenance', () => {
    const result = assembleOcrPage({
      pageNumber: 12,
      bookName: 'Calculus Book',
      reconciliation: [],
      blocks: [
        { type: 'header', content: 'Chapter 1' },
        { type: 'text', content: '1. Evaluate $\\int x dx$.' },
        { type: 'list', content: '(a) $x$ (b) $x^2/2$ (c) $2x$ (d) $1$' },
        { type: 'text', content: 'Ans: (b)' },
        { type: 'text', content: 'Sol. Integrate using the power rule.' },
      ],
    });
    expect(result.questions).toHaveLength(1);
    expect(result.questions[0]).toMatchObject({
      sourceQuestionNumber: '1',
      options: ['$x$', '$x^2/2$', '$2x$', '$1$'],
      correctAnswer: '(b)',
      explanation: 'Integrate using the power rule.',
      reviewStatus: 'READY_FOR_SEMANTIC_REVIEW',
    });
    expect(result.questions[0].tags).toContain('Calculus Book');
  });

  it('holds questions containing a provider-disputed formula block', () => {
    const result = assembleOcrPage({
      pageNumber: 5,
      bookName: 'Book',
      blocks: [
        { type: 'text', content: 'Example 3 Evaluate the integral.' },
        { type: 'equation', content: '$$\\int x dx$$' },
      ],
      reconciliation: [{ pageNumber: 5, blockIndex: 1, similarity: 0.8, reviewStatus: 'HOLD_FOR_RECONCILIATION' }],
    });
    expect(result.questions[0].reviewStatus).toBe('HOLD');
    expect(result.questions[0].holdReasons).toContain('FORMULA_PROVIDER_DISAGREEMENT:block-1');
  });

  it('recognizes bold Markdown example and solution labels', () => {
    const result = assembleOcrPage({
      pageNumber: 7,
      bookName: 'Book',
      reconciliation: [],
      blocks: [
        { type: 'text', content: '**Example 11** Evaluate $\\int f(x)dx$.' },
        { type: 'text', content: '**Sol.** Let $I=\\int f(x)dx$.' },
      ],
    });
    expect(result.questions).toHaveLength(1);
    expect(result.questions[0].sourceQuestionNumber).toBe('11');
    expect(result.questions[0].explanation).toContain('Let $I=');
  });

  it('records leading solution continuations as orphans instead of questions', () => {
    const result = assembleOcrPage({
      pageNumber: 8,
      bookName: 'Book',
      reconciliation: [],
      blocks: [{ type: 'equation', content: '$$x=2$$' }],
    });
    expect(result.questions).toHaveLength(0);
    expect(result.orphanBlocks[0].reason).toBe('ORPHAN_SOLUTION_OR_CONTINUATION');
  });

  it('starts an example from a title and ignores numbered facts outside exercises', () => {
    const result = assembleOcrPage({
      pageNumber: 9,
      bookName: 'Book',
      reconciliation: [],
      blocks: [
        { type: 'title', content: '# Example 12' },
        { type: 'text', content: '(i) Find $f(x)$.' },
        { type: 'text', content: '**Sol.** Work shown.' },
        { type: 'title', content: '# Important Points' },
        { type: 'text', content: '1. Integration is linear.' },
      ],
    });
    expect(result.questions).toHaveLength(1);
    expect(result.questions[0].sourceQuestionNumber).toBe('12');
    expect(result.questions[0].content).toContain('Find $f(x)$');
  });

  it('does not treat numbered solution steps as questions on a continuation page', () => {
    const result = assembleOcrPage({
      pageNumber: 10,
      bookName: 'Book',
      reconciliation: [],
      blocks: [
        { type: 'equation', content: '$$x=2$$' },
        { type: 'text', content: '44. $I=\\int f(x)dx$' },
      ],
    });
    expect(result.questions).toHaveLength(0);
  });
});
