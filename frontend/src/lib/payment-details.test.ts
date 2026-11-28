import { describe, expect, it } from 'vitest';
import { normalizeUpiReference, upiPayLink } from './payment-details';

describe('normalizeUpiReference', () => {
  it('accepts a 12-digit UTR and app transaction IDs, dropping spaces and dashes', () => {
    expect(normalizeUpiReference('4335 1234 5678')).toBe('433512345678');
    expect(normalizeUpiReference(' t2411261234567890123456 ')).toBe('T2411261234567890123456');
    expect(normalizeUpiReference('AXIS-123456')).toBe('AXIS123456');
  });

  it('refuses anything that cannot be a reference', () => {
    for (const bad of [undefined, null, 12345678, '', '12345', 'paid already!', 'x'.repeat(36), '1234;drop']) {
      expect(normalizeUpiReference(bad)).toBeNull();
    }
  });
});

describe('upiPayLink', () => {
  it('fills in the payee, amount in rupees and paise, and a short note', () => {
    const link = new URL(upiPayLink(2500, 'Mathswiz fee: Installment 1 of a long batch name that goes on'));
    expect(link.protocol).toBe('upi:');
    expect(link.searchParams.get('pa')).toBe('9434289963@hdfc');
    expect(link.searchParams.get('pn')).toBe('Sindhu Nair');
    expect(link.searchParams.get('am')).toBe('2500.00');
    expect(link.searchParams.get('cu')).toBe('INR');
    expect(link.searchParams.get('tn')?.length).toBeLessThanOrEqual(50);
  });
});
