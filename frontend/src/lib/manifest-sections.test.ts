import { describe, expect, it } from 'vitest';
import { matchSections } from './manifest-sections';

const existing = [
  { id: 'theory', sectionType: 'THEORY', startPage: 334 },
  { id: 'ncert', sectionType: 'NCERT_SELECTED', startPage: 337 },
  { id: 'case', sectionType: 'CASE_STUDY', startPage: 196 },
];

describe('matchSections', () => {
  it('keeps the row of a section with the same type and start page, whatever else changed', () => {
    const { ids, removed } = matchSections(existing, [{ sectionType: 'THEORY', startPage: 334 }, { sectionType: 'NCERT_SELECTED', startPage: 337 }, { sectionType: 'CASE_STUDY', startPage: 196 }]);
    expect(ids).toEqual(['theory', 'ncert', 'case']);
    expect(removed).toEqual([]);
  });

  it('keeps the row of a section of the same type whose start page moved, and treats a new type as new', () => {
    const { ids, removed } = matchSections(existing, [{ sectionType: 'NCERT_SELECTED', startPage: 338 }, { sectionType: 'MCQ', startPage: 342 }]);
    expect(ids).toEqual(['ncert', null]);
    expect(removed).toEqual(['theory', 'case']);
  });

  it('prefers the exact match over an earlier row of the same type', () => {
    const two = [{ id: 'sa1', sectionType: 'SHORT_ANSWER', startPage: 32 }, { id: 'sa2', sectionType: 'SHORT_ANSWER', startPage: 33 }];
    expect(matchSections(two, [{ sectionType: 'short_answer', startPage: 33 }, { sectionType: 'SHORT_ANSWER', startPage: 40 }]).ids).toEqual(['sa2', 'sa1']);
  });
});
