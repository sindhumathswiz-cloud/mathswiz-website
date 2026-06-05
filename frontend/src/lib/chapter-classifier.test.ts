import { describe, it, expect } from 'vitest';
import { snapToChapter, canonicalChapters, chapterFromFilename } from './chapter-classifier';

describe('chapterFromFilename', () => {
  it('strips extension, timestamp prefix and separators', () => {
    expect(chapterFromFilename('1778608132157_Limits.pdf')).toBe('Limits');
    expect(chapterFromFilename('Application-of-Integrals.pdf')).toBe('Application of Integrals');
    expect(chapterFromFilename('Vector_Algebra.PDF')).toBe('Vector Algebra');
    expect(chapterFromFilename('')).toBe('');
  });

  it('feeds into snapToChapter end to end', () => {
    expect(snapToChapter(chapterFromFilename('1778608132157_Limits.pdf'), 'Class 12'))
      .toBe('Continuity and Differentiability');
  });
});

describe('snapToChapter', () => {
  it('exact match (case/spacing/punct insensitive)', () => {
    expect(snapToChapter('INTEGRALS')).toBe('Integrals');
    expect(snapToChapter('relations & functions')).toBe('Relations and Functions');
    expect(snapToChapter('Application of Integrals')).toBe('Application of Integrals');
  });

  it('alias keywords map to canonical chapters', () => {
    expect(snapToChapter('Integration by parts')).toBe('Integrals');
    expect(snapToChapter('Vectors')).toBe('Vector Algebra');
    expect(snapToChapter('3D Geometry')).toBe('Three Dimensional Geometry');
    expect(snapToChapter('LPP')).toBe('Linear Programming');
    expect(snapToChapter('Maxima and Minima')).toBe('Application of Derivatives');
  });

  it('does not let the generic "integral" alias override the specific chapter', () => {
    expect(snapToChapter('Area under the curve')).toBe('Application of Integrals');
  });

  it('routes "Limits" to Continuity & Differentiability for Class 12', () => {
    expect(snapToChapter('Limits', 'Class 12')).toBe('Continuity and Differentiability');
  });

  it('routes "Limits and Derivatives" to the Class 11 chapter', () => {
    expect(snapToChapter('Limits and Derivatives', 'Class 11')).toBe('Limits and Derivatives');
  });

  it('returns null when there is no confident match', () => {
    expect(snapToChapter('Quantum Field Theory')).toBeNull();
    expect(snapToChapter('')).toBeNull();
    expect(snapToChapter(null)).toBeNull();
  });
});

describe('canonicalChapters', () => {
  it('returns 13 Class 12 chapters by default', () => {
    expect(canonicalChapters()).toHaveLength(13);
    expect(canonicalChapters('Class 12')).toContain('Probability');
  });
  it('returns Class 11 list (with Limits and Derivatives) when class is 11', () => {
    expect(canonicalChapters('Class 11')).toContain('Limits and Derivatives');
  });
});
