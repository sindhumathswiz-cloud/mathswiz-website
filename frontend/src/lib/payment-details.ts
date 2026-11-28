/**
 * Where students pay their fees: one UPI account. Students pay from their own UPI app, then report the payment's
 * reference number; a teacher or admin confirms it against the bank statement and marks the fee paid. Nothing here
 * marks a fee paid by itself.
 */
export const UPI_PAYMENT = {
  upiId: '9434289963@hdfc',
  payeeName: 'Sindhu Nair',
  /** The bank's own QR for this UPI ID (public/payments/upi-qr.jpg). */
  qrImage: '/payments/upi-qr.jpg',
} as const;

/** A fee the student has paid and reported, waiting for a teacher or admin to confirm it. */
export const PAYMENT_PENDING_VERIFICATION = 'PENDING_VERIFICATION';

/** Fee statuses a student may report a payment against (a confirmed fee is final). */
export const REPORTABLE_PAYMENT_STATUSES = ['UPCOMING', 'UNPAID', PAYMENT_PENDING_VERIFICATION] as const;

/**
 * A UPI payment's reference as students copy it from their app: the 12-digit UTR / "UPI transaction ID", or an app's
 * own transaction ID (letters and digits, e.g. PhonePe's "T2411…"). Spaces and dashes are dropped; anything else
 * outside letters and digits, or a length outside 6–35, is refused. Returns null when it is not a usable reference.
 */
export function normalizeUpiReference(input: unknown): string | null {
  if (typeof input !== 'string') return null;
  const ref = input.replace(/[\s-]+/g, '').toUpperCase();
  return /^[A-Z0-9]{6,35}$/.test(ref) ? ref : null;
}

/**
 * A upi://pay link that opens the student's UPI app with the payee, amount and note filled in. Used only as a
 * shortcut on phones; some apps refuse such links for personal accounts, so the QR and UPI ID are always shown too.
 */
export function upiPayLink(amount: number, note: string): string {
  const params = new URLSearchParams({
    pa: UPI_PAYMENT.upiId,
    pn: UPI_PAYMENT.payeeName,
    am: amount.toFixed(2),
    cu: 'INR',
    tn: note.slice(0, 50),
  });
  return `upi://pay?${params.toString()}`;
}
