import { describe, expect, it } from 'vitest';
import { answerKeyLines, answerLinesFor, optionList, paperShapeOf, printedNumbering, questionNumber } from './paper-layout';

describe('paper layout', () => {
  it('lays each question type out the way a printed paper would', () => {
    expect(['SINGLE_CHOICE', 'ASSERTION_REASONING', 'TRUE_FALSE'].map(paperShapeOf)).toEqual(['CHOICE', 'CHOICE', 'CHOICE']);
    expect(paperShapeOf('INTEGER')).toBe('NUMERICAL');
    expect(['SHORT_ANSWER', 'LONG_ANSWER', 'CASE_STUDY'].map(paperShapeOf)).toEqual(['WRITTEN', 'WRITTEN', 'WRITTEN']);
  });

  it('gives a written answer room in proportion to its marks, within limits', () => {
    expect(answerLinesFor(1)).toBe(4);
    expect(answerLinesFor(3)).toBe(9);
    expect(answerLinesFor(5)).toBe(15);
    expect(answerLinesFor(40)).toBe(30);
    expect(answerLinesFor(NaN)).toBe(4);
  });

  it('numbers questions from 1 within each section', () => {
    expect([0, 1, 9].map(questionNumber)).toEqual(['1.', '2.', '10.']);
  });

  it('reads options whether stored as an array or as JSON text, and survives garbage', () => {
    expect(optionList(['2', 3])).toEqual(['2', '3']);
    expect(optionList('["a","b"]')).toEqual(['a', 'b']);
    expect(optionList('not json')).toEqual([]);
    expect(optionList(null)).toEqual([]);
  });

  it('builds an answer key that sends written answers to the teacher', () => {
    const key = answerKeyLines([
      { title: 'Section A', questions: [{ type: 'SINGLE_CHOICE', correctAnswer: 'B' }, { type: 'INTEGER', correctAnswer: ' 12.5 ' }] },
      { title: 'Section B', questions: [{ type: 'LONG_ANSWER', correctAnswer: '' }, { type: 'SINGLE_CHOICE', correctAnswer: null }] },
    ]);
    expect(key).toEqual([
      { section: 'Section A', number: '1.', answer: 'B' },
      { section: 'Section A', number: '2.', answer: '12.5' },
      { section: 'Section B', number: '1.', answer: 'Marked by the teacher' },
      { section: 'Section B', number: '2.', answer: 'Not recorded' },
    ]);
  });

  it('numbers alternatives as one question with an OR between them', () => {
    const numbering = printedNumbering([{}, { choiceGroup: 'g' }, { choiceGroup: 'g' }, {}, { choiceGroup: 'h' }, { choiceGroup: 'h' }]);
    expect(numbering.map(n => n.number)).toEqual(['1.', '2.', '2.', '3.', '4.', '4.']);
    expect(numbering.map(n => n.orBefore)).toEqual([false, false, true, false, false, true]);
  });

  it('labels the second alternative in the answer key', () => {
    const key = answerKeyLines([{ title: 'C', questions: [{ type: 'SHORT_ANSWER', correctAnswer: null, choiceGroup: 'g' }, { type: 'SHORT_ANSWER', correctAnswer: null, choiceGroup: 'g' }, { type: 'SINGLE_CHOICE', correctAnswer: 'D' }] }]);
    expect(key.map(k => k.number)).toEqual(['1.', '1. (OR)', '2.']);
  });
});
