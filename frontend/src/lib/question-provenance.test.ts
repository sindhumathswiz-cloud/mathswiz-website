import { describe, expect, it } from 'vitest';
import { assertApprovable, deriveProvenance, provenanceApprovalError, type ApprovableQuestion } from './question-provenance';

const bookSourced: ApprovableQuestion = {
  provenance: 'BOOK_SOURCED',
  bookId: 'book-1',
  sourcePageStart: 42,
  sourcePageEnd: 42,
  printedNumber: '7',
};

describe('provenanceApprovalError', () => {
  it('allows a BOOK_SOURCED question that has its full source page and printed number', () => {
    expect(provenanceApprovalError(bookSourced)).toBeNull();
  });

  it('allows any MANUALLY_AUTHORED question regardless of its source fields', () => {
    expect(provenanceApprovalError({ provenance: 'MANUALLY_AUTHORED', bookId: null, sourcePageStart: null, sourcePageEnd: null, printedNumber: null })).toBeNull();
  });

  it('blocks a BOOK_SOURCED question missing its printed number', () => {
    const error = provenanceApprovalError({ ...bookSourced, printedNumber: null });
    expect(error).toContain('printedNumber');
    expect(error).not.toContain('bookId');
  });

  it('blocks a BOOK_SOURCED question missing its source page range', () => {
    const error = provenanceApprovalError({ ...bookSourced, sourcePageStart: null, sourcePageEnd: null });
    expect(error).toContain('sourcePageStart');
    expect(error).toContain('sourcePageEnd');
  });

  it('blocks a BOOK_SOURCED question with no bookId at all, naming every missing field', () => {
    const error = provenanceApprovalError({ provenance: 'BOOK_SOURCED', bookId: null, sourcePageStart: null, sourcePageEnd: null, printedNumber: null });
    expect(error).toContain('bookId');
    expect(error).toContain('sourcePageStart');
    expect(error).toContain('sourcePageEnd');
    expect(error).toContain('printedNumber');
  });

  it('suggests the MANUALLY_AUTHORED escape hatch in the error message', () => {
    const error = provenanceApprovalError({ ...bookSourced, printedNumber: null });
    expect(error).toContain('MANUALLY_AUTHORED');
  });
});

describe('assertApprovable', () => {
  it('does not throw for an approvable question', () => {
    expect(() => assertApprovable(bookSourced)).not.toThrow();
  });

  it('throws provenanceApprovalError\'s exact message for a blocked question', () => {
    const blocked = { ...bookSourced, printedNumber: null };
    expect(() => assertApprovable(blocked)).toThrow(provenanceApprovalError(blocked)!);
  });
});

describe('deriveProvenance', () => {
  it('is BOOK_SOURCED when a bookId is present', () => {
    expect(deriveProvenance('book-1')).toBe('BOOK_SOURCED');
  });

  it('is MANUALLY_AUTHORED when there is no bookId', () => {
    expect(deriveProvenance(null)).toBe('MANUALLY_AUTHORED');
    expect(deriveProvenance(undefined)).toBe('MANUALLY_AUTHORED');
  });
});
