import { describe, expect, it } from 'vitest';
import { answersMatch, countedQuestionIds, isAnswered } from './exam-scoring';

describe('isAnswered', () => {
  it('is false for nothing, null, and a blank or whitespace-only box', () => {
    expect(isAnswered(undefined)).toBe(false);
    expect(isAnswered(null)).toBe(false);
    expect(isAnswered({})).toBe(false);
    expect(isAnswered({ selectedOption: null })).toBe(false);
    expect(isAnswered({ selectedOption: '' })).toBe(false);
    expect(isAnswered({ selectedOption: '   ' })).toBe(false);
  });

  it('is true for an option letter, a number, and zero', () => {
    expect(isAnswered({ selectedOption: 'B' })).toBe(true);
    expect(isAnswered({ selectedOption: '12' })).toBe(true);
    expect(isAnswered({ selectedOption: 0 })).toBe(true);
    expect(isAnswered({ selectedOption: '0' })).toBe(true);
  });
});

describe('answersMatch', () => {
  it('compares numerical answers as numbers, whatever the formatting', () => {
    for (const typed of ['5', '05', '5.0', ' 5 ', '+5', '5.000', '0.5e1']) expect(answersMatch('INTEGER', '5', typed)).toBe(true);
    expect(answersMatch('INTEGER', '-3', '-3.0')).toBe(true);
    expect(answersMatch('INTEGER', '0.5', '.5')).toBe(true);
  });

  it('rejects a different number, and does not let a near miss through', () => {
    expect(answersMatch('INTEGER', '5', '6')).toBe(false);
    expect(answersMatch('INTEGER', '5', '5.01')).toBe(false);
    expect(answersMatch('INTEGER', '5', '-5')).toBe(false);
  });

  it('falls back to exact text for a non-numeric numerical answer', () => {
    expect(answersMatch('INTEGER', 'pi/2', 'pi/2')).toBe(true);
    expect(answersMatch('INTEGER', 'pi/2', 'pi / 2')).toBe(false);
    expect(answersMatch('INTEGER', '5', 'five')).toBe(false);
  });

  it('keeps choice questions as exact option-letter matches, and never matches a missing key', () => {
    expect(answersMatch('SINGLE_CHOICE', 'B', 'B')).toBe(true);
    expect(answersMatch('SINGLE_CHOICE', 'B', 'b')).toBe(false);
    expect(answersMatch('TRUE_FALSE', 'A', 'A')).toBe(true);
    expect(answersMatch('INTEGER', null, '5')).toBe(false);
    expect(answersMatch('SINGLE_CHOICE', undefined, 'A')).toBe(false);
  });
});

describe('countedQuestionIds', () => {
  const section = (attemptLimit: number | null, n = 10) => ({ attemptLimit, questions: Array.from({ length: n }, (_, i) => ({ id: `q${i + 1}` })) });
  const answers = (...ids: string[]) => Object.fromEntries(ids.map(id => [id, { selectedOption: '1' }]));

  it('is null for a section with no limit, so everything counts', () => {
    expect(countedQuestionIds(section(null), answers('q1'))).toBeNull();
    expect(countedQuestionIds(section(0), answers('q1'))).toBeNull();
    expect(countedQuestionIds(section(undefined as unknown as null), answers('q1'))).toBeNull();
  });

  it('counts every answer while the student is within the limit', () => {
    expect([...countedQuestionIds(section(5), answers('q2', 'q7'))!]).toEqual(['q2', 'q7']);
    expect(countedQuestionIds(section(5), {})!.size).toBe(0);
  });

  it('counts only the first N answered questions in section order, however the answers were given', () => {
    const counted = countedQuestionIds(section(3), answers('q9', 'q1', 'q4', 'q2', 'q6'))!;
    expect([...counted].sort()).toEqual(['q1', 'q2', 'q4']);
    expect(counted.has('q6')).toBe(false);
    expect(counted.has('q9')).toBe(false);
  });

  it('does not spend the limit on blank answers', () => {
    const responses = { q1: { selectedOption: '' }, q2: { selectedOption: null }, q3: { selectedOption: '7' }, q4: { selectedOption: '8' } };
    expect([...countedQuestionIds(section(1, 4), responses)!]).toEqual(['q3']);
  });
});
