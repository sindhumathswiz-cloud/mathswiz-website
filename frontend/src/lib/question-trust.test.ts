import { describe, expect, it } from 'vitest';
import { deriveTrustLevel } from './question-trust';

describe('deriveTrustLevel', () => {
  const cases: Array<[string, string, ReturnType<typeof deriveTrustLevel>]> = [
    ['APPROVED', 'MATHEMATICALLY_VERIFIED', 'verified'],
    ['APPROVED', 'VERIFIED', 'verified'], // set by resolve-flag's "Mark resolved" -- a genuine admin confirmation
    ['APPROVED', 'UNVERIFIED', 'approved'],
    ['APPROVED', 'STRUCTURALLY_VALID', 'approved'],
    ['APPROVED', 'ANSWER_MATCHED', 'approved'],
    ['APPROVED', 'SOLUTION_MATCHED', 'approved'],
    ['APPROVED', 'NEEDS_REVIEW', 'approved'],
    ['DRAFT', 'MATHEMATICALLY_VERIFIED', 'pending'],
    ['DRAFT', 'VERIFIED', 'pending'], // resolve-flag never changes status -- an unapproved row stays pending regardless
    ['PENDING_REVIEW', 'MATHEMATICALLY_VERIFIED', 'pending'],
    ['REPORTED', 'MATHEMATICALLY_VERIFIED', 'pending'],
    ['ARCHIVED', 'MATHEMATICALLY_VERIFIED', 'pending'],
    ['DRAFT', 'UNVERIFIED', 'pending'],
  ];

  it.each(cases)('status=%s verificationStatus=%s -> %s', (status, verificationStatus, expected) => {
    expect(deriveTrustLevel({ status, verificationStatus })).toBe(expected);
  });
});
