import { describe, expect, it } from 'vitest';
import { alternativePositions, attemptedIn, buildExamSections, canAnswer, examMaxFromSections, instructionRows, isNumericalType, isWrittenType, questionTypeLabel, sectionIndexOf, stableShuffle, statusCounts, submitWarnings, summaryRows, type ExamResponse } from './exam-view';

const raw = [
  { id: 's1', title: 'Section A', instructions: 'Choose one.', marksPerQuestion: 4, negativeMarks: 1, attemptLimit: null, questions: ['a1', 'a2', 'a3'].map(id => ({ question: { id } })) },
  { id: 's2', title: 'Section B', instructions: null, marksPerQuestion: 4, negativeMarks: 0, attemptLimit: 2, questions: ['b1', 'b2', 'b3', 'b4'].map(id => ({ question: { id } })) },
];
const sections = () => buildExamSections(raw);
const res = (selectedOption: string | null, status: ExamResponse['status'] = 'ANSWERED'): ExamResponse => ({ selectedOption, status, timeSpent: 0 });

describe('buildExamSections', () => {
  it('lays sections out over the flat question list and normalises missing fields', () => {
    const [a, b] = sections();
    expect(a).toMatchObject({ id: 's1', startIndex: 0, questionIds: ['a1', 'a2', 'a3'], attemptLimit: null });
    expect(b).toMatchObject({ id: 's2', startIndex: 3, instructions: '', attemptLimit: 2, negativeMarks: 0 });
  });

  it('treats a limit that is not below the question count as no limit', () => {
    const built = buildExamSections([{ id: 'x', title: 'X', attemptLimit: 3, questions: ['q1', 'q2', 'q3'].map(id => ({ question: { id } })) }, { id: 'y', title: 'Y', attemptLimit: 0, questions: [{ question: { id: 'q4' } }] }]);
    expect(built.map(s => s.attemptLimit)).toEqual([null, null]);
  });
});

describe('sectionIndexOf', () => {
  it('finds the section for a flat index, including the boundaries', () => {
    const s = sections();
    expect([0, 2, 3, 6].map(i => sectionIndexOf(s, i))).toEqual([0, 0, 1, 1]);
    expect(sectionIndexOf(s, 99)).toBe(1);
  });
});

describe('canAnswer (attempt-any-N)', () => {
  const [, b] = sections();

  it('allows answers while under the limit, and always allows changing one already given', () => {
    expect(canAnswer(b, { b1: res('5') }, 'b2')).toEqual({ ok: true });
    expect(canAnswer(b, { b1: res('5'), b2: res('6') }, 'b1')).toEqual({ ok: true });
  });

  it('refuses a new answer once the limit is used, and says what to do', () => {
    const check = canAnswer(b, { b1: res('5'), b2: res('6') }, 'b3');
    expect(check.ok).toBe(false);
    expect(check.ok === false && check.reason).toMatch(/only 2 questions in Section B.*Clear one/);
  });

  it('does not spend the limit on a cleared or blank answer', () => {
    expect(canAnswer(b, { b1: res('5'), b2: res('') }, 'b3')).toEqual({ ok: true });
    expect(canAnswer(b, { b1: res(null, 'NOT_ANSWERED'), b2: res('6') }, 'b3')).toEqual({ ok: true });
  });

  it('never limits an unlimited section', () => {
    const [a] = sections();
    expect(canAnswer(a, { a1: res('A'), a2: res('B') }, 'a3')).toEqual({ ok: true });
  });
});

describe('palette counts and summary', () => {
  const responses: Record<string, ExamResponse> = {
    a1: res('A'), a2: res(null, 'NOT_ANSWERED'), a3: res('C', 'ANSWERED_AND_MARKED'),
    b1: res('4'), b2: res(null, 'MARKED_FOR_REVIEW'),
  };

  it('counts each of the five statuses, treating a missing response as not visited', () => {
    const [a, b] = sections();
    expect(statusCounts(a.questionIds, responses)).toEqual({ ANSWERED: 1, NOT_ANSWERED: 1, NOT_VISITED: 0, MARKED_FOR_REVIEW: 0, ANSWERED_AND_MARKED: 1 });
    expect(statusCounts(b.questionIds, responses)).toEqual({ ANSWERED: 1, NOT_ANSWERED: 0, NOT_VISITED: 2, MARKED_FOR_REVIEW: 1, ANSWERED_AND_MARKED: 0 });
  });

  it('counts answered questions by what is actually held, not by the status label', () => {
    const [a] = sections();
    expect(attemptedIn(a, responses)).toBe(2);
    expect(attemptedIn(a, { a1: res('A', 'NOT_ANSWERED') })).toBe(1);
  });

  it('builds a per-section summary with the limit', () => {
    const rows = summaryRows(sections(), responses);
    expect(rows.map(r => [r.title, r.total, r.attempted, r.attemptLimit])).toEqual([['Section A', 3, 2, null], ['Section B', 4, 1, 2]]);
  });

  it('warns about what is still unanswered (against the limit where there is one) and what is marked', () => {
    const warnings = submitWarnings(summaryRows(sections(), responses));
    expect(warnings).toContain('Section A: 1 of 3 still unanswered.');
    expect(warnings).toContain('Section A: 1 marked for review.');
    expect(warnings).toContain('Section B: 1 of 2 you may answer still unanswered.');
    expect(warnings).toContain('Section B: 1 marked for review.');
  });

  it('says nothing when everything is answered and nothing is marked', () => {
    const all: Record<string, ExamResponse> = { a1: res('A'), a2: res('B'), a3: res('C'), b1: res('1'), b2: res('2') };
    expect(submitWarnings(summaryRows(sections(), all))).toEqual([]);
  });
});

describe('instruction rows and marks', () => {
  it('describes each section: questions, attempt rule, marking and the most it can score', () => {
    const rows = instructionRows(sections());
    expect(rows[0]).toEqual({ title: 'Section A', questions: 3, alternatives: 0, rule: null, marking: '+4 correct · −1 wrong', maxMarks: 12 });
    expect(rows[1]).toEqual({ title: 'Section B', questions: 4, alternatives: 0, rule: 'Attempt any 2 of 4', marking: '+4 correct · no negative marking', maxMarks: 8 });
    expect(examMaxFromSections(sections())).toBe(20);
  });
});

describe('question types', () => {
  it('recognises numerical and written questions and labels types for students', () => {
    expect(isNumericalType('INTEGER')).toBe(true);
    expect(isNumericalType('SINGLE_CHOICE')).toBe(false);
    expect(isWrittenType('LONG_ANSWER')).toBe(true);
    expect(isWrittenType('INTEGER')).toBe(false);
    expect(['INTEGER', 'MULTIPLE_CHOICE', 'SINGLE_CHOICE', 'SUBJECTIVE', 'TRUE_FALSE'].map(questionTypeLabel)).toEqual(['Numerical value', 'Multiple choice', 'Single correct', 'Written answer', 'True / false']);
  });
});

describe('stableShuffle', () => {
  const items = ['A', 'B', 'C', 'D', 'E', 'F'];

  it('gives the same order every time for the same seed, and never loses or repeats an item', () => {
    const first = stableShuffle(items, 'attempt-1:q9');
    expect(stableShuffle(items, 'attempt-1:q9')).toEqual(first);
    expect([...first].sort()).toEqual(items);
  });

  it('differs between questions and between students', () => {
    const orders = new Set(['a:q1', 'a:q2', 'a:q3', 'b:q1', 'b:q2', 'b:q3'].map(seed => stableShuffle(items, seed).join('')));
    expect(orders.size).toBeGreaterThan(3);
  });

  it('does not mutate its input and copes with tiny lists', () => {
    const copy = [...items];
    stableShuffle(items, 'x');
    expect(items).toEqual(copy);
    expect(stableShuffle([], 'x')).toEqual([]);
    expect(stableShuffle(['only'], 'x')).toEqual(['only']);
  });
});

describe('internal choice', () => {
  // Section: q1, then q2 OR q3, then q4 OR q5, then q6. Four slots, six questions, 3 marks each.
  const paper = buildExamSections([{
    id: 's', title: 'Section C', marksPerQuestion: 3, negativeMarks: 0, attemptLimit: null,
    questions: [
      { question: { id: 'q1' } },
      { question: { id: 'q2' }, choiceGroup: 'g1' }, { question: { id: 'q3' }, choiceGroup: 'g1' },
      { question: { id: 'q4' }, choiceGroup: 'g2' }, { question: { id: 'q5' }, choiceGroup: 'g2' },
      { question: { id: 'q6' } },
    ],
  }]);
  const [section] = paper;

  it('counts alternatives as one question for the paper, the marks and the instructions', () => {
    expect(section.slotCount).toBe(4);
    expect(examMaxFromSections(paper)).toBe(12);
    expect(instructionRows(paper)[0]).toMatchObject({ questions: 4, alternatives: 2, maxMarks: 12 });
  });

  it('refuses an answer to the second alternative once the first is answered, and names the first', () => {
    const check = canAnswer(section, { q2: res('B') }, 'q3');
    expect(check.ok).toBe(false);
    expect(check.ok === false && check.reason).toMatch(/alternative to Question 2.*Clear that answer first/);
    // Changing the answered alternative, or answering a different question, is fine.
    expect(canAnswer(section, { q2: res('B') }, 'q2')).toEqual({ ok: true });
    expect(canAnswer(section, { q2: res('B') }, 'q4')).toEqual({ ok: true });
    // Clearing the first frees the second.
    expect(canAnswer(section, { q2: res(null, 'NOT_ANSWERED') }, 'q3')).toEqual({ ok: true });
  });

  it('counts answered alternatives once, whichever of the pair was answered', () => {
    expect(attemptedIn(section, { q1: res('A'), q3: res('C') })).toBe(2);
    expect(attemptedIn(section, { q2: res('A'), q3: res('A') })).toBe(1);
  });

  it('summarises by question to answer, not by question listed', () => {
    const [row] = summaryRows(paper, { q1: res('A'), q3: res('C') });
    expect(row).toMatchObject({ total: 4, attempted: 2 });
    expect(Object.values(row.counts).reduce((a, b) => a + b, 0)).toBe(4);
    expect(row.counts.ANSWERED).toBe(2);
    expect(submitWarnings([row])).toContain('Section C: 2 of 4 still unanswered.');
  });

  it('applies an attempt limit to slots, not to listed questions', () => {
    const [limited] = buildExamSections([{
      id: 's', title: 'B', marksPerQuestion: 1, negativeMarks: 0, attemptLimit: 2,
      questions: [{ question: { id: 'a' } }, { question: { id: 'b' }, choiceGroup: 'g' }, { question: { id: 'c' }, choiceGroup: 'g' }, { question: { id: 'd' } }],
    }]);
    expect(limited.attemptLimit).toBe(2);
    expect(canAnswer(limited, { a: res('1'), b: res('1') }, 'd').ok).toBe(false);
    expect(canAnswer(limited, { a: res('1') }, 'd')).toEqual({ ok: true });
  });

  it('tells a question which positions it is an alternative to', () => {
    expect(alternativePositions(section, 'q2')).toEqual([3]);
    expect(alternativePositions(section, 'q5')).toEqual([4]);
    expect(alternativePositions(section, 'q1')).toEqual([]);
  });
});
