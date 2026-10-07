import { describe, expect, it } from 'vitest';
import { attemptRuleLabel, EXAM_PATTERNS, examMaxMarks, findExamPattern, markingLabel, patternMaxMarks, roundMarks, sectionMaxMarks, sectionsFromPattern } from './exam-patterns';

describe('exam patterns', () => {
  it('JEE Main Mathematics totals 100 marks: 20 multiple choice and 5 numerical, all compulsory, -1 on both', () => {
    const pattern = findExamPattern('JEE_MAIN_MATHS')!;
    expect(patternMaxMarks(pattern)).toBe(100);
    expect(pattern.sections.map(s => s.questionCount)).toEqual([20, 5]);
    // The "attempt any 5 of 10" choice ended in 2023, and numericals carry negative marking.
    expect(pattern.sections[1]).toMatchObject({ attemptLimit: null, negativeMarks: 1, kind: 'NUMERICAL' });
  });

  it('NDA Mathematics totals 300 marks and a wrong answer costs a third of the question', () => {
    const pattern = findExamPattern('NDA_MATHS')!;
    expect(patternMaxMarks(pattern)).toBe(300);
    expect(pattern.durationMinutes).toBe(150);
    expect(pattern.sections[0].negativeMarks).toBeCloseTo(pattern.sections[0].marksPerQuestion / 3, 1);
  });

  it('CUET Mathematics is 50 compulsory questions at +5 / -1', () => {
    const pattern = findExamPattern('CUET_MATHS')!;
    expect(patternMaxMarks(pattern)).toBe(250);
    expect(pattern.sections[0]).toMatchObject({ questionCount: 50, attemptLimit: null, marksPerQuestion: 5, negativeMarks: 1 });
  });

  it('CBSE Class 12 Mathematics is 80 marks over 38 questions, with Section A auto-scored and B to E written', () => {
    const pattern = findExamPattern('CBSE_12_MATHS')!;
    expect(patternMaxMarks(pattern)).toBe(80);
    expect(pattern.sections.map(s => s.questionCount)).toEqual([20, 5, 6, 4, 3]);
    expect(pattern.sections.map(s => s.questionCount * s.marksPerQuestion)).toEqual([20, 10, 18, 20, 12]);
    expect(pattern.durationMinutes).toBe(180);
    expect(pattern.sections.map(s => s.kind)).toEqual(['MCQ', 'WRITTEN', 'WRITTEN', 'WRITTEN', 'WRITTEN']);
    expect(pattern.sections.every(s => s.negativeMarks === 0)).toBe(true);
  });

  it('says when each pattern was last checked, so a stale one is easy to spot', () => {
    for (const pattern of EXAM_PATTERNS) expect(pattern.verifyNote).toMatch(/Checked [0-9]+ [A-Za-z]+ [0-9]{4}/);
  });

  it('every pattern has a known kind, a question type per section, a verify note and a unique id', () => {
    expect(new Set(EXAM_PATTERNS.map(p => p.id)).size).toBe(EXAM_PATTERNS.length);
    for (const pattern of EXAM_PATTERNS) {
      expect(pattern.verifyNote.length).toBeGreaterThan(20);
      expect(pattern.durationMinutes).toBeGreaterThan(0);
      for (const section of pattern.sections) {
        expect(['MCQ', 'NUMERICAL', 'WRITTEN']).toContain(section.kind);
        expect(section.questionType).toMatch(/^[A-Z_]+$/);
        if (section.attemptLimit !== null) expect(section.attemptLimit).toBeLessThanOrEqual(section.questionCount);
      }
    }
  });

  it('finds nothing for an unknown or missing id', () => {
    expect(findExamPattern('NOPE')).toBeNull();
    expect(findExamPattern(null)).toBeNull();
  });
});

describe('marks arithmetic', () => {
  it('counts only the questions that can score, and treats a limit above the count as no limit', () => {
    expect(sectionMaxMarks({ questionCount: 10, attemptLimit: 5, marksPerQuestion: 4 })).toBe(20);
    expect(sectionMaxMarks({ questionCount: 10, attemptLimit: null, marksPerQuestion: 4 })).toBe(40);
    expect(sectionMaxMarks({ questionCount: 10, attemptLimit: 99, marksPerQuestion: 4 })).toBe(40);
    expect(sectionMaxMarks({ questionCount: 10, attemptLimit: 0, marksPerQuestion: 4 })).toBe(40);
    expect(examMaxMarks([{ questionCount: 20, marksPerQuestion: 4 }, { questionCount: 10, attemptLimit: 5, marksPerQuestion: 4 }])).toBe(100);
  });

  it('does not leak floating-point noise into marks', () => {
    expect(roundMarks(0.1 + 0.2)).toBe(0.3);
    expect(examMaxMarks([{ questionCount: 3, marksPerQuestion: 0.1 }])).toBe(0.3);
  });

  it('describes marking and attempt rules in plain words', () => {
    expect(markingLabel({ marksPerQuestion: 4, negativeMarks: 1 })).toBe('+4 correct · −1 wrong');
    expect(markingLabel({ marksPerQuestion: 4, negativeMarks: 0 })).toBe('+4 correct · no negative marking');
    expect(markingLabel({ marksPerQuestion: 2.5, negativeMarks: 0.83 })).toBe('+2.5 correct · −0.83 wrong');
    expect(attemptRuleLabel({ questionCount: 10, attemptLimit: 5 })).toBe('Attempt any 5 of 10');
    expect(attemptRuleLabel({ questionCount: 10, attemptLimit: null })).toBeNull();
    expect(attemptRuleLabel({ questionCount: 10, attemptLimit: 10 })).toBeNull();
  });

  it('turns a pattern into builder sections carrying how many questions each needs', () => {
    const sections = sectionsFromPattern(findExamPattern('JEE_MAIN_MATHS')!);
    expect(sections).toHaveLength(2);
    expect(sections[1]).toMatchObject({ title: 'Section B', targetQuestions: 5, attemptLimit: null, negativeMarks: 1, kind: 'NUMERICAL' });
  });

  it('carries an attempt limit through when a pattern has one (older papers, or one a teacher defines)', () => {
    const [section] = sectionsFromPattern({
      id: 'X', name: 'X', summary: '', durationMinutes: 30, verifyNote: '',
      sections: [{ title: 'B', instructions: '', kind: 'NUMERICAL', questionType: 'INTEGER', questionCount: 10, attemptLimit: 5, marksPerQuestion: 4, negativeMarks: 0 }],
    });
    expect(section).toMatchObject({ targetQuestions: 10, attemptLimit: 5 });
  });
});
