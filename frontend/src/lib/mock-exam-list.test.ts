import { describe, expect, it } from 'vitest';
import { summarizeMockExam } from './mock-exam-list';

const jee = {
  examPattern: 'JEE_MAIN_MATHS',
  totalMarks: 999,
  sections: [
    { title: 'Section A', marksPerQuestion: 4, attemptLimit: null, _count: { questions: 20 } },
    { title: 'Section B', marksPerQuestion: 4, attemptLimit: 5, _count: { questions: 10 } },
  ],
};

describe('summarizeMockExam', () => {
  it('describes the paper from its sections, with the real ceiling for attempt-any-N', () => {
    const s = summarizeMockExam(jee);
    expect(s.patternName).toMatch(/JEE/);
    expect(s.sections).toEqual([
      { title: 'Section A', questions: 20, rule: null },
      { title: 'Section B', questions: 10, rule: 'any 5' },
    ]);
    expect(s.totalQuestions).toBe(30);
    // 20 x 4 + 5 x 4, not the stale totalMarks of 999 and not 30 x 4.
    expect(s.maxMarks).toBe(100);
  });

  it('falls back to totalMarks when sections are not loaded, and to no pattern for unknown ids', () => {
    const s = summarizeMockExam({ examPattern: 'NOPE', totalMarks: 60 });
    expect(s).toMatchObject({ patternName: null, maxMarks: 60, totalQuestions: 0, attemptsUsed: 0, bestScore: null, lastScore: null, trend: null });
  });

  it('reports best, last and the direction of the last two attempts in time order', () => {
    const s = summarizeMockExam({
      ...jee,
      attempts: [
        { totalScore: 62, endTime: '2026-09-20T10:00:00Z' },
        { totalScore: 40, endTime: '2026-09-01T10:00:00Z' },
        { totalScore: 55, endTime: '2026-09-10T10:00:00Z' },
      ],
    });
    expect(s).toMatchObject({ attemptsUsed: 3, bestScore: 62, lastScore: 62, trend: 'UP' });
  });

  it('shows a fall and a flat result, and no trend after a single attempt', () => {
    const at = (scores: number[]) => summarizeMockExam({ ...jee, attempts: scores.map((totalScore, i) => ({ totalScore, endTime: new Date(2026, 8, i + 1) })) });
    expect(at([70, 50]).trend).toBe('DOWN');
    expect(at([50, 50]).trend).toBe('FLAT');
    expect(at([50]).trend).toBeNull();
  });

  it('counts a pair of alternatives as one question, in the count and in the marks', () => {
    const cbse = summarizeMockExam({
      sections: [{ title: 'Section B', marksPerQuestion: 2, attemptLimit: null, questions: [{}, { choiceGroup: 'g' }, { choiceGroup: 'g' }, {}, {}] }],
    });
    expect(cbse.sections).toEqual([{ title: 'Section B', questions: 4, rule: null }]);
    expect(cbse.totalQuestions).toBe(4);
    expect(cbse.maxMarks).toBe(8);
  });
});
