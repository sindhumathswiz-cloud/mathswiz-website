import { describe, expect, it } from 'vitest';
import { exerciseForPage } from './exercise-link';

const ex = (id: string, startPage: number | null, endPage: number | null, sectionType: string | null = 'SHORT_ANSWER') => ({ id, sectionType, startPage, endPage });

describe('exerciseForPage', () => {
  const exercises = [ex('theory', 240, 242, 'THEORY'), ex('mcq', 243, 246, 'MCQ'), ex('short', 247, 250), ex('long', 250, 255, 'LONG_ANSWER')];

  it('files a question under the one exercise whose pages contain its first page', () => {
    expect(exerciseForPage(exercises, 244)).toBe('mcq');
    expect(exerciseForPage(exercises, 247)).toBe('short');
    expect(exerciseForPage(exercises, 255)).toBe('long');
  });

  it('leaves it unlinked on a page two exercises share', () => {
    expect(exerciseForPage(exercises, 250)).toBeNull();
  });

  it('never files a question under a theory section', () => {
    expect(exerciseForPage(exercises, 241)).toBeNull();
  });

  it('leaves it unlinked outside every exercise, or when a range or the page is unknown', () => {
    expect(exerciseForPage(exercises, 300)).toBeNull();
    expect(exerciseForPage([ex('open', 10, null)], 10)).toBeNull();
    expect(exerciseForPage(exercises, null)).toBeNull();
  });
});
