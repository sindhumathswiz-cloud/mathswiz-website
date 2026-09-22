import { describe, expect, it } from 'vitest';
import { deriveTrustLevel } from './question-trust';

describe('deriveTrustLevel', () => {
  const cases: Array<[string, string, ReturnType<typeof deriveTrustLevel>]> = [
    ['APPROVED', 'MATHEMATICALLY_VERIFIED', 'verified'],
    ['APPROVED', 'UNVERIFIED', 'approved'],
    ['APPROVED', 'STRUCTURALLY_VALID', 'approved'],
    ['APPROVED', 'ANSWER_MATCHED', 'approved'],
    ['APPROVED', 'SOLUTION_MATCHED', 'approved'],
    ['APPROVED', 'NEEDS_REVIEW', 'approved'],
    ['APPROVED', 'VERIFIED', 'approved'], // the unused enum member deliberately doesn't count
    ['DRAFT', 'MATHEMATICALLY_VERIFIED', 'pending'],
    ['PENDING_REVIEW', 'MATHEMATICALLY_VERIFIED', 'pending'],
    ['REPORTED', 'MATHEMATICALLY_VERIFIED', 'pending'],
    ['ARCHIVED', 'MATHEMATICALLY_VERIFIED', 'pending'],
    ['DRAFT', 'UNVERIFIED', 'pending'],
  ];

  it.each(cases)('status=%s verificationStatus=%s -> %s', (status, verificationStatus, expected) => {
    expect(deriveTrustLevel({ status, verificationStatus })).toBe(expected);
  });
});
