import { describe, it, expect } from 'vitest';
import { normalizeExtractedQuestion, normalizeExtractedQuestions, classifyType } from './extract-normalizer';

describe('classifyType', () => {
  it('MCQ when there are options', () => {
    expect(classifyType('What is $2+2$?', ['$3$', '$4$'])).toBe('SINGLE_CHOICE');
  });
  it('subjective when no options', () => {
    expect(classifyType('Find the derivative of $x^2$.', [])).toBe('SUBJECTIVE');
  });
  it('long answer for prove/show that', () => {
    expect(classifyType('Prove that $\\sqrt 2$ is irrational.', [])).toBe('LONG_ANSWER');
  });
  it('assertion-reasoning and case study and true/false', () => {
    expect(classifyType('Assertion (A): ... Reason (R): ...', [])).toBe('ASSERTION_REASONING');
    expect(classifyType('Read the following passage and answer.', [])).toBe('CASE_STUDY');
    expect(classifyType('State whether the statement is true or false.', [])).toBe('TRUE_FALSE');
  });
});

describe('normalizeExtractedQuestion', () => {
  it('keeps canonical field names', () => {
    const q = normalizeExtractedQuestion({
      questionContent: 'What is $2+2$?',
      options: ['$3$', '$4$', '$5$', '$6$'],
      correctAnswer: 'B',
      explanation: 'Addition.',
      tags: ['Arithmetic'],
    });
    expect(q.questionContent).toBe('What is $2+2$?');
    expect(q.correctAnswer).toBe('B');
    expect(q.explanation).toBe('Addition.');
    expect(q.options).toEqual(['$3$', '$4$', '$5$', '$6$']);
    expect(q.tags).toEqual(['Arithmetic']);
  });

  it('maps common LLM aliases (content/answer/solution) to canonical keys', () => {
    const q = normalizeExtractedQuestion({
      content: 'Solve for $x$: $x+1=3$',
      answer: 'A',
      solution: '$x=2$',
      choices: ['$2$', '$3$'],
    });
    expect(q.questionContent).toBe('Solve for $x$: $x+1=3$');
    expect(q.correctAnswer).toBe('A');
    expect(q.explanation).toBe('$x=2$');
    expect(q.options).toEqual(['$2$', '$3$']);
  });

  it('normalizes options given as {label,text} objects and strips leading labels', () => {
    const q = normalizeExtractedQuestion({
      question: 'Pick one',
      options: [
        { label: 'A', text: '$x^2$' },
        { label: 'B', text: '$x^3$' },
      ],
    });
    expect(q.options).toEqual(['$x^2$', '$x^3$']);
  });

  it('strips inline option labels from string options', () => {
    const q = normalizeExtractedQuestion({
      question: 'Q',
      options: ['(a) red', 'B. blue', 'c) green'],
    });
    expect(q.options).toEqual(['red', 'blue', 'green']);
  });

  it('maps full answer text to its option letter', () => {
    const q = normalizeExtractedQuestion({
      questionContent: 'Choose',
      options: ['$\\frac{x^3}{3}+C$', '$2x$'],
      correctAnswer: '$\\frac{x^3}{3} + C$',
    });
    expect(q.correctAnswer).toBe('A');
  });

  it('coerces wrapped / lowercase letters to a bare uppercase letter', () => {
    expect(normalizeExtractedQuestion({ question: 'Q', options: ['x', 'y'], correctAnswer: '(b)' }).correctAnswer).toBe('B');
    expect(normalizeExtractedQuestion({ question: 'Q', options: ['x', 'y'], correctAnswer: 'a' }).correctAnswer).toBe('A');
  });

  it('never invents an answer: missing answer stays empty', () => {
    const q = normalizeExtractedQuestion({ questionContent: 'Prove that $\\sqrt 2$ is irrational.' });
    expect(q.correctAnswer).toBe('');
    expect(q.options).toEqual([]);
    expect(q.type).toBe('LONG_ANSWER');
  });

  it('honors a valid explicit type but derives an invalid one', () => {
    expect(normalizeExtractedQuestion({ question: 'Q', type: 'integer', correctAnswer: '$5$' }).type).toBe('INTEGER');
    expect(normalizeExtractedQuestion({ question: 'Find $x$.', type: 'nonsense' }).type).toBe('SUBJECTIVE');
  });

  it('carries a valid difficulty and defaults invalid/missing to MEDIUM', () => {
    expect(normalizeExtractedQuestion({ question: 'Q', difficulty: 'hard' }).difficulty).toBe('HARD');
    expect(normalizeExtractedQuestion({ question: 'Q', difficulty: 'Easy' }).difficulty).toBe('EASY');
    expect(normalizeExtractedQuestion({ question: 'Q', difficulty: 'tricky' }).difficulty).toBe('MEDIUM');
    expect(normalizeExtractedQuestion({ question: 'Q' }).difficulty).toBe('MEDIUM');
  });

  it('keeps integer/subjective answers verbatim when there are no options', () => {
    const q = normalizeExtractedQuestion({ question: 'Value of $x$?', answer: '$x=5$' });
    expect(q.correctAnswer).toBe('$x=5$');
  });
});

describe('normalizeExtractedQuestions', () => {
  it('unwraps { questions: [...] }', () => {
    const out = normalizeExtractedQuestions({ questions: [{ content: 'a question here' }] });
    expect(out).toHaveLength(1);
    expect(out[0].questionContent).toBe('a question here');
  });

  it('accepts a bare array and a single object', () => {
    expect(normalizeExtractedQuestions([{ content: 'first question text' }])).toHaveLength(1);
    expect(normalizeExtractedQuestions({ content: 'single question text' })).toHaveLength(1);
  });

  it('drops answer-only / equation-only fragments (the data[0] trap)', () => {
    const out = normalizeExtractedQuestions([
      { content: '$x=5$' },                         // too short, no options -> dropped
      { content: 'What is the value of $x$ if $x+1=6$?' }, // real question -> kept
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].questionContent).toContain('value of');
  });

  it('returns [] for junk input', () => {
    expect(normalizeExtractedQuestions(null)).toEqual([]);
    expect(normalizeExtractedQuestions('oops')).toEqual([]);
  });
});
