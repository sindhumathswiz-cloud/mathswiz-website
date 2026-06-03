import { describe, it, expect } from 'vitest';
import { isQuestionLine, isSolutionLine } from '@/lib/solution-matcher';

describe('Solution Matcher - Pattern Detection', () => {
  describe('isQuestionLine', () => {
    it('detects numbered questions with dot', () => {
      expect(isQuestionLine('1. Find the value of x')).toBe(true);
      expect(isQuestionLine('12. Solve the equation')).toBe(true);
    });

    it('detects numbered questions with parenthesis', () => {
      expect(isQuestionLine('1) What is the answer')).toBe(true);
      expect(isQuestionLine('5) Calculate the area')).toBe(true);
    });

    it('detects Q. prefixed questions', () => {
      expect(isQuestionLine('Q.1 Find the derivative')).toBe(true);
      expect(isQuestionLine('Q 2 Solve for x')).toBe(true);
    });

    it('detects Problem prefixed questions', () => {
      expect(isQuestionLine('Problem 1: Find x')).toBe(true);
      expect(isQuestionLine('problem 3: Solve')).toBe(true);
    });

    it('rejects non-question lines', () => {
      expect(isQuestionLine('This is a solution')).toBe(false);
      expect(isQuestionLine('Answer: 42')).toBe(false);
      expect(isQuestionLine('')).toBe(false);
    });
  });

  describe('isSolutionLine', () => {
    it('detects Sol. prefix', () => {
      expect(isSolutionLine('Sol. Using the formula')).toBe(true);
      expect(isSolutionLine('sol: Step 1')).toBe(true);
    });

    it('detects Solution prefix', () => {
      expect(isSolutionLine('Solution: Apply theorem')).toBe(true);
      expect(isSolutionLine('Solution 1.')).toBe(true);
    });

    it('detects Ans. prefix', () => {
      expect(isSolutionLine('Ans. 42')).toBe(true);
      expect(isSolutionLine('ans: x = 5')).toBe(true);
    });

    it('detects Answer prefix', () => {
      expect(isSolutionLine('Answer: The value is 5')).toBe(true);
    });

    it('rejects non-solution lines', () => {
      expect(isSolutionLine('Question 1')).toBe(false);
      expect(isSolutionLine('Find x')).toBe(false);
      expect(isSolutionLine('')).toBe(false);
    });
  });
});
