import { describe, expect, it } from 'vitest';
import { editedFields, optionsOf } from './reader-edit';

const base = { content: 'Find x', options: ['1', '2', '3', '4'], correctAnswer: 'B', explanation: 'Because.' };

describe('optionsOf', () => {
  it('reads options stored as an array, as JSON text, or not at all', () => {
    expect(optionsOf(['a', 2, null])).toEqual(['a', '2', '']);
    expect(optionsOf('["x","y"]')).toEqual(['x', 'y']);
    expect(optionsOf('not json')).toEqual([]);
    expect(optionsOf(null)).toEqual([]);
    expect(optionsOf({ a: 1 })).toEqual([]);
  });
});

describe('editedFields', () => {
  it('is empty when nothing changed', () => {
    expect(editedFields(base, { ...base, options: [...base.options] })).toEqual({});
  });

  it('names only the fields that changed', () => {
    expect(editedFields(base, { ...base, content: 'Find x if y', correctAnswer: 'C' })).toEqual({ content: 'Find x if y', correctAnswer: 'C' });
    expect(editedFields(base, { ...base, explanation: '' })).toEqual({ explanation: '' });
  });

  it('sends all the options when one of them changed, or when the count changed', () => {
    expect(editedFields(base, { ...base, options: ['1', '2', 'three', '4'] })).toEqual({ options: ['1', '2', 'three', '4'] });
    expect(editedFields(base, { ...base, options: ['1', '2', '3'] })).toEqual({ options: ['1', '2', '3'] });
  });
});
