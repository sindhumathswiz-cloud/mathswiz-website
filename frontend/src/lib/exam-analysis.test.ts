// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { analyseAttempt, type AnalysisResponse, type AnalysisSection } from './exam-analysis';

const section = (over: Partial<AnalysisSection> & { ids: string[] }): AnalysisSection => ({
  id: 's1', title: 'Section A', marksPerQuestion: 4, negativeMarks: 1, attemptLimit: null,
  questions: over.ids.map((questionId) => ({ questionId, choiceGroup: null })),
  ...over,
});

const response = (over: Partial<AnalysisResponse> & { questionId: string }): AnalysisResponse => ({
  status: 'ANSWERED', isCorrect: true, marksAwarded: 4, timeSpent: 60, topic: 'Algebra', difficulty: 'MEDIUM', isWritten: false, errorType: null,
  ...over,
});
const wrong = (questionId: string, over: Partial<AnalysisResponse> = {}) => response({ questionId, isCorrect: false, marksAwarded: -1, errorType: 'NEEDS_REVIEW', ...over });
const blank = (questionId: string, over: Partial<AnalysisResponse> = {}) => response({ questionId, status: 'SKIPPED', isCorrect: false, marksAwarded: 0, timeSpent: 0, ...over });

describe('analyseAttempt', () => {
  it('splits the score into what right answers earned and what wrong ones took back', () => {
    const a = analyseAttempt({
      sections: [section({ ids: ['q1', 'q2', 'q3', 'q4'] })],
      responses: [response({ questionId: 'q1' }), response({ questionId: 'q2' }), wrong('q3'), wrong('q4', { topic: 'Calculus' })],
      medianTime: 60,
    });
    expect(a.grossMarks).toBe(8);
    expect(a.negativeMarksLost).toBe(2);
    expect(a.netMarks).toBe(6);
    expect(a.hasNegativeMarking).toBe(true);
    expect(a.topicsHitByNegative.map((t) => t.topic).sort()).toEqual(['Algebra', 'Calculus']);
  });

  it('has no deduction story when the paper has no negative marking', () => {
    const a = analyseAttempt({
      sections: [section({ ids: ['q1', 'q2'], negativeMarks: 0 })],
      responses: [response({ questionId: 'q1' }), wrong('q2', { marksAwarded: 0 })],
      medianTime: 60,
    });
    expect(a.hasNegativeMarking).toBe(false);
    expect(a.negativeMarksLost).toBe(0);
    expect(a.sections[0].breakEven).toBeNull();
    expect(a.takeaways.some((t) => t.includes('deductions'))).toBe(false);
  });

  it('gives the accuracy a guess needs to pay for each marking scheme', () => {
    const a = analyseAttempt({
      sections: [section({ ids: ['q1'], marksPerQuestion: 4, negativeMarks: 1 }), section({ id: 's2', title: 'Section B', ids: ['q2'], marksPerQuestion: 2, negativeMarks: 1 })],
      responses: [response({ questionId: 'q1' }), wrong('q2')],
      medianTime: 60,
    });
    expect(a.sections.map((s) => s.breakEven)).toEqual([20, 33]);
  });

  it('reports accuracy by difficulty, treating a missing difficulty as medium', () => {
    const a = analyseAttempt({
      sections: [section({ ids: ['e1', 'e2', 'm1', 'h1', 'h2'] })],
      responses: [
        response({ questionId: 'e1', difficulty: 'EASY' }), wrong('e2', { difficulty: 'EASY' }),
        response({ questionId: 'm1', difficulty: null }),
        wrong('h1', { difficulty: 'HARD' }), blank('h2', { difficulty: 'HARD' }),
      ],
      medianTime: 60,
    });
    const [easy, medium, hard] = a.byDifficulty;
    expect(easy).toMatchObject({ attempted: 2, correct: 1, accuracy: 50 });
    expect(medium).toMatchObject({ attempted: 1, correct: 1, accuracy: 100 });
    expect(hard).toMatchObject({ attempted: 1, correct: 0, skipped: 1, accuracy: 0 });
  });

  it('counts quick answers as guesses and says what they cost', () => {
    const a = analyseAttempt({
      sections: [section({ ids: ['q1', 'q2', 'q3', 'q4'] })],
      responses: [
        wrong('q1', { timeSpent: 10 }), wrong('q2', { timeSpent: 12 }), response({ questionId: 'q3', timeSpent: 15 }), // 3 quick: -1 -1 +4
        response({ questionId: 'q4', timeSpent: 60 }),
      ],
      medianTime: 60,
    });
    expect(a.guesses).toEqual({ count: 3, correct: 1, netMarks: 2, costMarks: 0 });

    const worse = analyseAttempt({
      sections: [section({ ids: ['q1', 'q2', 'q3'] })],
      responses: [wrong('q1', { timeSpent: 5 }), wrong('q2', { timeSpent: 5 }), response({ questionId: 'q3', timeSpent: 60 })],
      medianTime: 60,
    });
    expect(worse.guesses).toMatchObject({ count: 2, netMarks: -2, costMarks: 2 });
    expect(worse.takeaways.join(' ')).toContain('Leaving them blank would have scored higher');
  });

  it('counts easy and medium misses, blanks and careless slips as marks within reach, but not hard ones', () => {
    const a = analyseAttempt({
      sections: [section({ ids: ['e-wrong', 'm-blank', 'h-wrong', 'h-blank', 'h-careless'] })],
      responses: [
        wrong('e-wrong', { difficulty: 'EASY' }),                       // 4 + 1 = 5
        blank('m-blank', { difficulty: 'MEDIUM' }),                     // 4
        wrong('h-wrong', { difficulty: 'HARD' }),                       // not within reach
        blank('h-blank', { difficulty: 'HARD' }),                       // not within reach
        wrong('h-careless', { difficulty: 'HARD', errorType: 'CARELESS' }), // 5, careless on any difficulty
      ],
      medianTime: 60,
    });
    expect(a.recoverable.total).toBe(14);
    expect(a.recoverable.byReason).toEqual({ CARELESS: 5, EASY: 5, MEDIUM: 4 });
    expect(a.recoverable.items.map((i) => i.questionId).sort()).toEqual(['e-wrong', 'h-careless', 'm-blank']);
  });

  it('does not count blanks that "attempt any N" or internal choice meant to leave out', () => {
    const limited = analyseAttempt({
      sections: [section({ ids: ['n1', 'n2', 'n3', 'n4'], attemptLimit: 2 })],
      responses: [response({ questionId: 'n1', difficulty: 'EASY' }), response({ questionId: 'n2', difficulty: 'EASY' }), blank('n3', { difficulty: 'EASY' }), blank('n4', { difficulty: 'EASY' })],
      medianTime: 60,
    });
    expect(limited.recoverable.total).toBe(0);

    const choice = analyseAttempt({
      sections: [{ id: 's', title: 'Long answers', marksPerQuestion: 4, negativeMarks: 0, attemptLimit: null, questions: [{ questionId: 'a', choiceGroup: 'Q3' }, { questionId: 'b', choiceGroup: 'Q3' }, { questionId: 'c', choiceGroup: null }] }],
      responses: [response({ questionId: 'a', difficulty: 'EASY' }), blank('b', { difficulty: 'EASY' }), response({ questionId: 'c', difficulty: 'EASY' })],
      medianTime: 60,
    });
    expect(choice.recoverable.total).toBe(0);
  });

  it('counts a blank internal-choice pair once, and "attempt any N" blanks only up to the free slots', () => {
    const choice = analyseAttempt({
      sections: [{ id: 's', title: 'B', marksPerQuestion: 4, negativeMarks: 0, attemptLimit: null, questions: [{ questionId: 'a', choiceGroup: 'Q3' }, { questionId: 'b', choiceGroup: 'Q3' }] }],
      responses: [blank('a', { difficulty: 'EASY' }), blank('b', { difficulty: 'EASY' })],
      medianTime: 60,
    });
    expect(choice.recoverable.total).toBe(4);

    const limited = analyseAttempt({
      sections: [section({ ids: ['n1', 'n2', 'n3', 'n4'], attemptLimit: 3 })],
      responses: [response({ questionId: 'n1' }), blank('n2', { difficulty: 'EASY' }), blank('n3', { difficulty: 'EASY' }), blank('n4', { difficulty: 'EASY' })],
      medianTime: 60,
    });
    expect(limited.recoverable.total).toBe(8); // two free slots, not three blanks
  });

  it('leaves out written answers and anything over the limit', () => {
    const a = analyseAttempt({
      sections: [section({ ids: ['q1', 'w1', 'o1'] })],
      responses: [response({ questionId: 'q1' }), wrong('w1', { isWritten: true, difficulty: 'EASY' }), wrong('o1', { status: 'OVER_LIMIT', difficulty: 'EASY' })],
      medianTime: 60,
    });
    expect(a.negativeMarksLost).toBe(0);
    expect(a.recoverable.total).toBe(0);
    expect(a.byDifficulty[0].attempted).toBe(0);
  });

  it('copes with an empty attempt', () => {
    const a = analyseAttempt({ sections: [], responses: [], medianTime: 60 });
    expect(a).toMatchObject({ grossMarks: 0, negativeMarksLost: 0, hasNegativeMarking: false, takeaways: [] });
    expect(a.byDifficulty.every((d) => d.accuracy === null)).toBe(true);
  });

  it('rounds fractional schemes', () => {
    const a = analyseAttempt({
      sections: [section({ ids: ['q1', 'q2', 'q3'], marksPerQuestion: 2.5, negativeMarks: 0.83 })],
      responses: [wrong('q1', { marksAwarded: -0.83 }), wrong('q2', { marksAwarded: -0.83 }), wrong('q3', { marksAwarded: -0.83 })],
      medianTime: 60,
    });
    expect(a.negativeMarksLost).toBe(2.49);
  });
});
