'use client';

import { BookText, Clock, ListChecks, PlayCircle, ShieldAlert } from 'lucide-react';
import type { ExamSummaryLine } from '@/lib/exam-view';
import { QUESTION_STATUS_LEGEND } from './ExamPalette';

/**
 * The page a student reads before the clock starts: what the paper contains, how
 * each section is marked, and what the colours mean. Every figure comes from the
 * test itself, so it describes this paper, not an exam in general.
 */
export default function ExamInstructions({
  title, durationMinutes, mode, patternName, rows, totalQuestions, maxMarks, writtenQuestions, onStart,
}: {
  title: string;
  durationMinutes: number;
  mode: string;
  patternName: string | null;
  rows: ExamSummaryLine[];
  totalQuestions: number;
  maxMarks: number;
  writtenQuestions: number;
  onStart: () => void;
}) {
  const strict = mode === 'STRICT';
  return (
    <div className="fixed inset-0 z-[100] overflow-y-auto bg-white dark:bg-background">
      <div className="mx-auto flex min-h-full w-full max-w-3xl flex-col justify-center gap-8 px-5 py-10">
        <header className="text-center">
          <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-indigo-50 dark:bg-brand/15"><BookText className="h-8 w-8 text-indigo-600 dark:text-brand" /></div>
          <p className="text-[11px] font-black uppercase tracking-[0.2em] text-slate-400 dark:text-slate-500">{patternName ? `Modelled on ${patternName}` : 'Examination'}</p>
          <h1 className="mt-1 font-display text-3xl font-black tracking-tight text-slate-900 dark:text-white">{title}</h1>
        </header>

        <dl className="grid grid-cols-3 gap-3 text-center">
          {[
            ['Duration', `${durationMinutes} min`],
            ['Questions', String(totalQuestions)],
            ['Maximum marks', String(maxMarks)],
          ].map(([label, value]) => (
            <div key={label} className="rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-white/10 dark:bg-surface-muted">
              <dt className="text-[10px] font-black uppercase tracking-widest text-slate-400">{label}</dt>
              <dd className="mt-1 text-2xl font-black tabular-nums text-slate-900 dark:text-white">{value}</dd>
            </div>
          ))}
        </dl>

        <section aria-labelledby="paper-structure">
          <h2 id="paper-structure" className="mb-2 flex items-center gap-2 text-sm font-black text-slate-900 dark:text-white"><ListChecks className="h-4 w-4 text-indigo-600 dark:text-brand" /> The paper</h2>
          <div className="overflow-x-auto rounded-2xl border border-slate-200 dark:border-white/10">
            <table className="w-full min-w-[34rem] text-left text-sm">
              <thead className="bg-slate-50 text-[10px] font-black uppercase tracking-widest text-slate-400 dark:bg-surface-muted">
                <tr><th className="p-3">Section</th><th className="p-3">Questions</th><th className="p-3">Marking</th><th className="p-3 text-right">Marks</th></tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-white/5">
                {rows.map(row => (
                  <tr key={row.title}>
                    <td className="p-3 font-black text-slate-900 dark:text-white">{row.title}</td>
                    <td className="p-3 tabular-nums text-slate-700 dark:text-slate-300">{row.questions}{row.rule && <span className="ml-2 rounded bg-indigo-50 px-1.5 py-0.5 text-[11px] font-bold text-indigo-700 dark:bg-brand/10 dark:text-brand">{row.rule}</span>}</td>
                    <td className="p-3 text-slate-700 dark:text-slate-300">{row.marking}</td>
                    <td className="p-3 text-right font-black tabular-nums text-slate-900 dark:text-white">{row.maxMarks}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {rows.some(row => row.rule) && <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">In an &ldquo;attempt any N&rdquo; section only the first N questions you answer are scored. The screen stops you answering more than N; clear an answer to change which ones count.</p>}
        </section>

        <section aria-labelledby="how-it-works" className="space-y-2.5 text-sm text-slate-700 dark:text-slate-300">
          <h2 id="how-it-works" className="flex items-center gap-2 text-sm font-black text-slate-900 dark:text-white"><Clock className="h-4 w-4 text-indigo-600 dark:text-brand" /> How it works</h2>
          <ul className="list-disc space-y-1.5 pl-5">
            <li>The timer runs for {durationMinutes} minutes and the paper is submitted automatically when it reaches zero. Your answers are kept on this device if the connection drops.</li>
            <li>Move between sections with the tabs. Each section has its own question numbers and counts.</li>
            <li>The panel beside the question shows where you are. {QUESTION_STATUS_LEGEND.map(item => item.label.toLowerCase()).join(', ')}.</li>
            <li><b>Save &amp; Continue</b> keeps your answer and moves on. <b>Mark for Review</b> flags a question to revisit; a question marked after you answered it is still scored.</li>
            <li>Numerical questions take a typed value; &ldquo;5&rdquo; and &ldquo;5.0&rdquo; are the same answer.</li>
          </ul>
        </section>

        {strict ? (
          <p className="flex gap-3 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm font-semibold text-rose-800 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-300">
            <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0" />
            <span>This paper runs in strict mode and in full screen. Switching tabs or leaving full screen gives a warning; the third warning submits the paper. Copying, pasting and printing are disabled.</span>
          </p>
        ) : (
          <p className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600 dark:border-white/10 dark:bg-surface-muted dark:text-slate-300">This paper runs in practice mode: you can leave the tab without a warning. The timer and scoring are the same as in the real thing.</p>
        )}

        {writtenQuestions > 0 && (
          <p className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm font-semibold text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300">
            {writtenQuestions} question{writtenQuestions === 1 ? '' : 's'} in this paper need{writtenQuestions === 1 ? 's' : ''} a written answer. Type it in the box under the question; your teacher marks it after the exam, and your total is updated then.
          </p>
        )}

        <button type="button" onClick={onStart} className="flex w-full items-center justify-center gap-3 rounded-2xl bg-gradient-to-br from-indigo-600 to-violet-600 py-5 text-base font-black text-white shadow-xl shadow-indigo-900/10 transition hover:opacity-95 dark:from-brand dark:to-brand-violet">
          <PlayCircle className="h-6 w-6" /> Start Examination
        </button>
      </div>
    </div>
  );
}
