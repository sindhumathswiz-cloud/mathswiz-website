import type { Exclusions } from './plan';

/**
 * What marks the end-to-end suite's own data, so the content sync never promotes it to the live site.
 * Must match e2e/fixtures/data.ts (a test checks they agree).
 */
export const E2E_EXCLUSIONS: Exclusions = {
  userMobiles: ['9990000001', '9990000002', '9990000003'],
  idPrefix: 'e2e-',
  questionTag: 'E2E-Reader',
  bookTitlePrefix: 'E2E ',
};
