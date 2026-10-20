// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { E2E_ADMIN, E2E_BOOK_PREFIX, E2E_READER_TAG, E2E_STUDENT, E2E_TEACHER, buildQuestions } from '../../../e2e/fixtures/data';
import { E2E_EXCLUSIONS } from './exclusions';

describe('E2E_EXCLUSIONS', () => {
  it('matches the markers the e2e fixtures actually use', () => {
    expect(E2E_EXCLUSIONS.userMobiles.sort()).toEqual([E2E_TEACHER, E2E_STUDENT, E2E_ADMIN].map((u) => u.mobileNumber).sort());
    expect(E2E_EXCLUSIONS.questionTag).toBe(E2E_READER_TAG);
    expect(E2E_EXCLUSIONS.bookTitlePrefix).toBe(E2E_BOOK_PREFIX);
    expect(buildQuestions('x', 'T', 1, ['EASY'])[0].id.startsWith(E2E_EXCLUSIONS.idPrefix)).toBe(true);
  });
});
