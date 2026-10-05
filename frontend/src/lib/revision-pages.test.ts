import { describe, expect, it, vi } from 'vitest';

vi.mock('./prisma', () => ({ default: {} }));

import { splitReferencePages, whyNotReferencePage } from './revision-pages';
import type { ConfirmedChapter } from './book-manifest';

const section = (overrides: Record<string, unknown>) => ({ noAnswers: false, answerKeyStartPage: null, answerKeyEndPage: null, solutionsStartPage: null, solutionsEndPage: null, ...overrides });
const chapter = (exercises: unknown[], confirmed = true) => ({ id: 'c1', manifestConfirmedAt: confirmed ? new Date() : null, exercises }) as unknown as ConfirmedChapter;

const THEORY = 'Definition. A function f is continuous at x = c if the limit equals the value of the function at c.';
const ANSWERS = 'Answers\n1. (i) (d)\n(ii) (a)\n2.$a$can\'t be determined,$b = 3$3.$a = 2$4.$x \\sin x$5.$2 x ^ { 3 / 2 }$';

describe('whyNotReferencePage', () => {
  it('lets an ordinary theory page through', () => {
    expect(whyNotReferencePage({ pageNumber: 225, text: THEORY }, [])).toBeNull();
  });

  it('skips pages the confirmed manifest puts in an answer-key or solutions range', () => {
    const confirmed = [chapter([section({ answerKeyStartPage: 269, answerKeyEndPage: 269 }), section({ solutionsStartPage: 240, solutionsEndPage: 241 })])];
    expect(whyNotReferencePage({ pageNumber: 269, text: THEORY }, confirmed)).toMatch(/answer key/);
    expect(whyNotReferencePage({ pageNumber: 241, text: THEORY }, confirmed)).toMatch(/solutions/);
    expect(whyNotReferencePage({ pageNumber: 242, text: THEORY }, confirmed)).toBeNull();
  });

  it('ignores a manifest that has not been confirmed', () => {
    const unconfirmed = [chapter([section({ answerKeyStartPage: 269, answerKeyEndPage: 269 })], false)];
    expect(whyNotReferencePage({ pageNumber: 269, text: THEORY }, unconfirmed)).toBeNull();
  });

  it('skips a page that opens with an Answers or Solutions heading even without a manifest', () => {
    expect(whyNotReferencePage({ pageNumber: 269, text: ANSWERS }, [])).toMatch(/Answers/);
    expect(whyNotReferencePage({ pageNumber: 9, text: 'Detailed Solutions of Exercise 7.1\n1. We have ...' }, [])).toMatch(/Solutions/);
    expect(whyNotReferencePage({ pageNumber: 9, text: '## Hints and Solutions\n1. Put x = ...' }, [])).not.toBeNull();
    expect(whyNotReferencePage({ pageNumber: 9, text: 'Answer Key\n1. B 2. C' }, [])).not.toBeNull();
  });

  it('does not mistake theory that merely mentions answers or solutions', () => {
    expect(whyNotReferencePage({ pageNumber: 9, text: 'Solutions of an equation are the values that satisfy it, and the answer is unique.' }, [])).toBeNull();
    expect(whyNotReferencePage({ pageNumber: 9, text: 'Theorem 1. Every quadratic has two solutions in the complex numbers.' }, [])).toBeNull();
  });

  it('recognises an unheaded multiple-choice answer key by its shape', () => {
    const key = Array.from({ length: 12 }, (_, i) => `${i + 1}. (${'ABCD'[i % 4]})`).join(' ');
    expect(whyNotReferencePage({ pageNumber: 50, text: key }, [])).toMatch(/answer key/);
  });
});

describe('splitReferencePages', () => {
  it('separates reference pages from skipped ones and says why', () => {
    const pages = [{ pageNumber: 268, text: THEORY }, { pageNumber: 269, text: ANSWERS }, { pageNumber: 270, text: THEORY }];
    const { reference, skipped } = splitReferencePages(pages, []);
    expect(reference.map(p => p.pageNumber)).toEqual([268, 270]);
    expect(skipped).toEqual([{ pageNumber: 269, reason: expect.stringContaining('Answers') }]);
  });
});
