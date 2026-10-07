'use client';

import { AlertTriangle, Loader2, Send } from 'lucide-react';
import type { SummaryRow } from '@/lib/exam-view';
import { submitWarnings } from '@/lib/exam-view';

/**
 * What the student is about to hand in, section by section, before anything is
 * sent. Replaces a bare browser confirm(): the numbers are the point, because an
 * unanswered question or an unreviewed mark is easy to miss on a long paper.
 */
export default function SubmitSummary({
  rows, secondsLeft, submitting, onBack, onSubmit,
}: {
  rows: SummaryRow[];
  secondsLeft: number;
  submitting: boolean;
  onBack: () => void;
  onSubmit: () => void;
}) {
  const warnings = submitWarnings(rows);
  const minutes = Math.ceil(secondsLeft / 60);
  return (
    <div className="fixed inset-0 z-[250] flex items-center justify-center bg-slate-900/70 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="submit-summary-title">
      <div className="flex max-h-full w-full max-w-3xl flex-col overflow-hidden rounded-3xl bg-white shadow-2xl dark:bg-surface">
        <header className="border-b border-slate-200 p-6 dark:border-white/10">
          <h2 id="submit-summary-title" className="font-display text-2xl font-black text-slate-900 dark:text-white">Review your paper</h2>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{minutes > 0 ? `${minutes} minute${minutes === 1 ? '' : 's'} left.` : 'Time is up.'} Once you submit, your answers are final.</p>
        </header>

        <div className="min-h-0 flex-1 overflow-auto p-6">
          <div className="overflow-x-auto rounded-2xl border border-slate-200 dark:border-white/10">
            <table className="w-full min-w-[34rem] text-left text-sm">
              <thead className="bg-slate-50 text-[10px] font-black uppercase tracking-widest text-slate-400 dark:bg-surface-muted">
                <tr>
                  <th className="p-3">Section</th><th className="p-3 text-right">Questions</th><th className="p-3 text-right">Answered</th>
                  <th className="p-3 text-right">Not answered</th><th className="p-3 text-right">Not visited</th><th className="p-3 text-right">Marked</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-white/5">
                {rows.map(row => (
                  <tr key={row.sectionId} className="tabular-nums">
                    <td className="p-3 font-black text-slate-900 dark:text-white">{row.title}{row.attemptLimit ? <span className="ml-2 text-[11px] font-bold text-indigo-600 dark:text-brand">attempt any {row.attemptLimit}</span> : null}</td>
                    <td className="p-3 text-right">{row.total}</td>
                    <td className="p-3 text-right font-bold text-emerald-700 dark:text-emerald-400">{row.attempted}</td>
                    <td className="p-3 text-right">{row.counts.NOT_ANSWERED}</td>
                    <td className="p-3 text-right">{row.counts.NOT_VISITED}</td>
                    <td className="p-3 text-right">{row.counts.MARKED_FOR_REVIEW + row.counts.ANSWERED_AND_MARKED}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {warnings.length > 0 && (
            <ul className="mt-4 space-y-1.5 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm font-semibold text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200">
              {warnings.map(line => <li key={line} className="flex gap-2"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> {line}</li>)}
            </ul>
          )}
        </div>

        <footer className="flex flex-wrap justify-end gap-3 border-t border-slate-200 p-6 dark:border-white/10">
          <button type="button" onClick={onBack} disabled={submitting} className="rounded-xl border-2 border-slate-200 px-6 py-3 text-sm font-black text-slate-600 transition hover:bg-slate-50 disabled:opacity-50 dark:border-white/10 dark:text-slate-300 dark:hover:bg-white/5">Back to the paper</button>
          <button type="button" onClick={onSubmit} disabled={submitting} className="inline-flex items-center gap-2 rounded-xl bg-rose-600 px-7 py-3 text-sm font-black text-white transition hover:bg-rose-700 disabled:opacity-50">
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} Submit exam
          </button>
        </footer>
      </div>
    </div>
  );
}
