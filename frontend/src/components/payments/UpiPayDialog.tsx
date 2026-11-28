'use client';

import React, { useEffect, useState } from 'react';
import { Check, Copy, Loader2, Smartphone, X } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { normalizeUpiReference, UPI_PAYMENT, upiPayLink } from '@/lib/payment-details';

type Fee = { id: string; amount: number; description: string; transactionId?: string | null; enrollment?: { batch?: { name?: string } } };

/**
 * Pay one fee by UPI: the QR and UPI ID with the amount, then the student enters the payment's reference so a teacher
 * can confirm it. Reporting never marks the fee paid; it shows as "Checking payment" until it is confirmed.
 */
export default function UpiPayDialog({ fee, onClose, onReported }: { fee: Fee; onClose: () => void; onReported: () => void }) {
  const [reference, setReference] = useState(fee.transactionId ?? '');
  const [submitting, setSubmitting] = useState(false);
  const [copied, setCopied] = useState(false);
  const [isPhone, setIsPhone] = useState(false);
  const amount = Number(fee.amount || 0);
  const valid = normalizeUpiReference(reference) !== null;

  useEffect(() => {
    setIsPhone(/Android|iPhone|iPad|iPod/i.test(navigator.userAgent));
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const copyUpiId = async () => {
    try {
      await navigator.clipboard.writeText(UPI_PAYMENT.upiId);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error('Could not copy. Select the UPI ID and copy it yourself.');
    }
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!valid || submitting) return;
    setSubmitting(true);
    try {
      const res = await fetch(`/api/student/payments/${fee.id}/report`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reference }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Could not send. Try again.');
      toast.success('Sent. Your fee shows as paid once your teacher confirms it.');
      onReported();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 p-0 sm:p-4" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="upi-pay-title"
        className="bg-white w-full sm:max-w-md max-h-[95vh] overflow-y-auto rounded-t-3xl sm:rounded-3xl shadow-2xl p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4 mb-4">
          <div>
            <h3 id="upi-pay-title" className="text-lg font-bold text-gray-900">Pay ₹ {amount.toLocaleString('en-IN')} by UPI</h3>
            <p className="text-sm text-gray-500">{fee.description}{fee.enrollment?.batch?.name ? ` · ${fee.enrollment.batch.name}` : ''}</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="p-1 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100">
            <X className="w-5 h-5" />
          </button>
        </div>

        <ol className="space-y-5 text-sm text-gray-700">
          <li>
            <p className="font-semibold text-gray-900 mb-2">1. Pay ₹ {amount.toLocaleString('en-IN')} to {UPI_PAYMENT.payeeName}</p>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={UPI_PAYMENT.qrImage} alt={`UPI QR code for ${UPI_PAYMENT.upiId}`} className="mx-auto w-56 max-w-full rounded-2xl" />
            <p className="text-center text-xs text-gray-500 mt-2">Scan with any UPI app (GPay, PhonePe, Paytm, BHIM), or pay to this UPI ID:</p>
            <div className="mt-2 flex items-center justify-center gap-2">
              <code className="select-all rounded-lg bg-gray-100 px-3 py-1.5 font-mono text-base font-bold text-gray-900">{UPI_PAYMENT.upiId}</code>
              <button type="button" onClick={copyUpiId} className="flex items-center gap-1 rounded-lg border border-gray-200 px-2.5 py-1.5 text-xs font-semibold text-indigo-700 hover:bg-indigo-50">
                {copied ? <><Check className="w-3.5 h-3.5" /> Copied</> : <><Copy className="w-3.5 h-3.5" /> Copy</>}
              </button>
            </div>
            {isPhone && (
              <a
                href={upiPayLink(amount, `Mathswiz ${fee.description}`)}
                className="mt-3 flex items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-indigo-700"
              >
                <Smartphone className="w-4 h-4" /> Open my UPI app
              </a>
            )}
          </li>
          <li>
            <form onSubmit={submit}>
              <label htmlFor="upi-reference" className="font-semibold text-gray-900 block mb-1">2. Enter the UPI transaction ID</label>
              <p className="text-xs text-gray-500 mb-2">After paying, your UPI app shows it on the payment&apos;s details, usually 12 digits (the UTR).</p>
              <input
                id="upi-reference"
                inputMode="text"
                autoComplete="off"
                value={reference}
                onChange={(e) => setReference(e.target.value)}
                placeholder="e.g. 433512345678"
                className="w-full rounded-xl border border-gray-300 px-4 py-2.5 font-mono text-base focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
              {reference && !valid && <p className="mt-1 text-xs text-red-600">That doesn&apos;t look like a UPI transaction ID: letters and digits only, at least 6.</p>}
              <button
                type="submit"
                disabled={!valid || submitting}
                className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {submitting && <Loader2 className="w-4 h-4 animate-spin" />} I&apos;ve paid: send for confirmation
              </button>
              <p className="mt-2 text-xs text-gray-500">Your teacher checks the payment and then marks the fee paid; your receipt appears here after that.</p>
            </form>
          </li>
        </ol>
      </div>
    </div>
  );
}
