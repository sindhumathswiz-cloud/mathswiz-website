import { describe, expect, it } from 'vitest';
import { extractClaimedAnswerIndex, parseQuestionOptions, resolveCorrectOptionIndex } from './arena-answer';

describe('Arena answer matching', () => {
    const options = ['$7, 6$', '$5, 1$', '$6, 3$', '$8, 7$'];

    it('matches a letter answer', () => {
        expect(resolveCorrectOptionIndex('B', options)).toBe(1);
        expect(resolveCorrectOptionIndex('(C)', options)).toBe(2);
    });

    it('matches generated option text despite LaTeX formatting', () => {
        expect(resolveCorrectOptionIndex('7, 6', options)).toBe(0);
        expect(resolveCorrectOptionIndex('$8, 7$', options)).toBe(3);
    });

    it('returns -1 when the generated answer cannot be matched', () => {
        expect(resolveCorrectOptionIndex('none', options)).toBe(-1);
    });
});

describe('Arena explanation answer claims', () => {
    it('extracts common explicit option claims', () => {
        expect(extractClaimedAnswerIndex('Therefore, the correct answer is option A.')).toBe(0);
        expect(extractClaimedAnswerIndex('The correct answer is B.')).toBe(1);
        expect(extractClaimedAnswerIndex('Option C is the correct choice.')).toBe(2);
        expect(extractClaimedAnswerIndex('Hence, option (D).')).toBe(3);
    });

    it('does not guess when no option is explicitly claimed', () => {
        expect(extractClaimedAnswerIndex('The solution set contains both intervals.')).toBeNull();
        expect(extractClaimedAnswerIndex('Hence, the correct answer is A pair of straight lines.')).toBeNull();
    });
});

describe('Arena option parsing', () => {
    it('accepts arrays and legacy JSON strings', () => {
        expect(parseQuestionOptions(['One', 2])).toEqual(['One', '2']);
        expect(parseQuestionOptions('["A","B"]')).toEqual(['A', 'B']);
    });

    it('normalizes object options', () => {
        expect(parseQuestionOptions([{ text: 'First' }, { value: 'Second' }])).toEqual(['First', 'Second']);
    });

    it('returns an empty list for empty, malformed, or non-array values', () => {
        expect(parseQuestionOptions('')).toEqual([]);
        expect(parseQuestionOptions('["truncated"')).toEqual([]);
        expect(parseQuestionOptions({ A: 'one' })).toEqual([]);
    });
});
