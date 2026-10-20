'use client';

import React from 'react';
import { MinusCircle, Gauge, Dices, LifeBuoy } from 'lucide-react';
import type { ExamAnalysis, RecoverableReason } from '@/lib/exam-analysis';

const DIFFICULTY_LABEL = { EASY: 'Easy', MEDIUM: 'Medium', HARD: 'Hard' } as const;
const DIFFICULTY_BAR = { EASY: 'bg-emerald-500', MEDIUM: 'bg-amber-500', HARD: 'bg-rose-500' } as const;
const REASON_LABEL: Record<RecoverableReason, string> = {
  CARELESS: 'Careless slips',
  EASY: 'Easy questions missed',
  MEDIUM: 'Medium questions missed',
};

const CARD = 'bg-white dark:bg-surface p-8 rounded-[40px] border border-slate-200 dark:border-white/10 shadow-sm';
const TITLE = 'font-display text-lg font-black text-slate-900 dark:text-white uppercase tracking-tighter';
const SUB = 'text-xs font-medium text-slate-500 dark:text-slate-400';

function Heading({ icon: Icon, title, sub }: { icon: React.ComponentType<{ className?: string }>; title: string; sub: string }) {
  return (
    <div className="mb-6">
      <div className="flex items-center gap-2 mb-2">
        <Icon className="w-5 h-5 text-indigo-600 dark:text-brand" />
        <h3 className={TITLE}>{title}</h3>
      </div>
      <p className={SUB}>{sub}</p>
    </div>
  );
}

const marks = (value: number) => `${value}`;

/** Exam-quality analysis: what negative marking cost, where accuracy slips by difficulty, whether quick answers paid, marks within reach. */
export default function ExamQualityPanel({ analysis }: { analysis: ExamAnalysis }) {
  const { guesses, recoverable } = analysis;
  const hasAnswers = analysis.byDifficulty.some((d) => d.attempted > 0);
  if (!hasAnswers && analysis.recoverable.total === 0) return null;

  return (
    <section aria-labelledby="exam-quality-heading" className="space-y-8" data-testid="exam-quality">
      <div>
        <h2 id="exam-quality-heading" className="font-display text-2xl font-black text-slate-900 dark:text-white tracking-tight">How your marks were won and lost</h2>
        {analysis.takeaways.length > 0 && (
          <ul className="mt-4 grid gap-2 md:grid-cols-2" data-testid="exam-takeaways">
            {analysis.takeaways.map((line) => (
              <li key={line} className="text-sm font-medium text-slate-700 dark:text-slate-300 bg-indigo-50/60 dark:bg-brand/10 border border-indigo-100 dark:border-brand/20 rounded-2xl px-5 py-3">{line}</li>
            ))}
          </ul>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Negative marking */}
        {analysis.hasNegativeMarking && (
          <div className={CARD} data-testid="negative-marking-card">
            <Heading icon={MinusCircle} title="Cost of negative marking" sub="Marks earned, marks taken back, and the accuracy at which attempting a question pays." />
            <dl className="grid grid-cols-3 gap-4 mb-6">
              <div><dt className="text-[10px] font-black uppercase tracking-widest text-slate-400 dark:text-slate-500">Earned</dt><dd className="text-2xl font-black text-emerald-600 dark:text-emerald-400">+{marks(analysis.grossMarks)}</dd></div>
              <div><dt className="text-[10px] font-black uppercase tracking-widest text-slate-400 dark:text-slate-500">Deducted</dt><dd className="text-2xl font-black text-rose-600 dark:text-rose-400" data-testid="marks-deducted">−{marks(analysis.negativeMarksLost)}</dd></div>
              <div><dt className="text-[10px] font-black uppercase tracking-widest text-slate-400 dark:text-slate-500">Net</dt><dd className="text-2xl font-black text-slate-900 dark:text-white">{marks(analysis.netMarks)}</dd></div>
            </dl>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <caption className="sr-only">Accuracy and break-even accuracy by section</caption>
                <thead>
                  <tr className="text-left text-[10px] font-black uppercase tracking-widest text-slate-400 dark:text-slate-500">
                    <th scope="col" className="py-2 pr-4">Section</th>
                    <th scope="col" className="py-2 pr-4">Scheme</th>
                    <th scope="col" className="py-2 pr-4 text-right">Your accuracy</th>
                    <th scope="col" className="py-2 text-right">Needed to break even</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-white/5 text-slate-800 dark:text-slate-200">
                  {analysis.sections.map((row) => (
                    <tr key={row.title}>
                      <th scope="row" className="py-3 pr-4 text-left font-bold">{row.title}</th>
                      <td className="py-3 pr-4 whitespace-nowrap">+{row.marksPerQuestion} / {row.negativeMarks > 0 ? `−${row.negativeMarks}` : 'no penalty'}</td>
                      <td className="py-3 pr-4 text-right font-bold">{row.accuracy == null ? '—' : `${row.accuracy}%`}</td>
                      <td className="py-3 text-right font-bold">{row.breakEven == null ? '—' : `above ${row.breakEven}%`}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {analysis.topicsHitByNegative.length > 0 && (
              <p className={`${SUB} mt-4`}>
                Deductions by topic: {analysis.topicsHitByNegative.slice(0, 4).map((t) => `${t.topic} (−${t.marksLost})`).join(', ')}.
              </p>
            )}
          </div>
        )}

        {/* Accuracy by difficulty */}
        <div className={CARD} data-testid="difficulty-card">
          <Heading icon={Gauge} title="Accuracy by difficulty" sub="Right answers out of the questions you attempted." />
          <ul className="space-y-5">
            {analysis.byDifficulty.map((d) => (
              <li key={d.difficulty}>
                <div className="flex items-baseline justify-between text-sm">
                  <span className="font-bold text-slate-900 dark:text-white">{DIFFICULTY_LABEL[d.difficulty]}</span>
                  <span className="font-medium text-slate-500 dark:text-slate-400">
                    {d.attempted === 0 ? 'None attempted' : `${d.correct} of ${d.attempted} right`}{d.skipped > 0 ? ` · ${d.skipped} left blank` : ''}
                  </span>
                </div>
                <div
                  className="mt-2 h-2.5 rounded-full bg-slate-100 dark:bg-white/10 overflow-hidden"
                  role="img"
                  aria-label={`${DIFFICULTY_LABEL[d.difficulty]} questions: ${d.accuracy == null ? 'none attempted' : `${d.accuracy}% correct`}`}
                >
                  <div className={`h-full ${DIFFICULTY_BAR[d.difficulty]}`} style={{ width: `${d.accuracy ?? 0}%` }} />
                </div>
              </li>
            ))}
          </ul>
        </div>

        {/* Guesses */}
        {guesses.count > 0 && (
          <div className={CARD} data-testid="guess-card">
            <Heading icon={Dices} title="Quick answers" sub="Answers given in under half your usual time are treated as guesses." />
            <p className="text-3xl font-black text-slate-900 dark:text-white">
              {guesses.correct} of {guesses.count} <span className="text-base font-bold text-slate-500 dark:text-slate-400">right</span>
            </p>
            <p className="mt-2 text-sm font-medium text-slate-700 dark:text-slate-300">
              {guesses.netMarks < 0
                ? `These cost you ${guesses.costMarks} marks net. Leaving them blank would have scored higher.`
                : guesses.netMarks > 0
                  ? `These added ${guesses.netMarks} marks net. They paid off this time.`
                  : 'These netted zero marks.'}
            </p>
          </div>
        )}

        {/* Marks within reach */}
        {recoverable.total > 0 && (
          <div className={CARD} data-testid="recoverable-card">
            <Heading icon={LifeBuoy} title="Marks within reach" sub="Lost on easier questions or to careless slips, so the quickest marks to win back." />
            <p className="text-4xl font-black text-indigo-600 dark:text-brand" data-testid="recoverable-total">{marks(recoverable.total)}</p>
            <ul className="mt-4 space-y-2 text-sm">
              {(Object.keys(REASON_LABEL) as RecoverableReason[]).filter((reason) => recoverable.byReason[reason] > 0).map((reason) => (
                <li key={reason} className="flex items-center justify-between rounded-2xl bg-slate-50 dark:bg-white/5 border border-slate-100 dark:border-white/10 px-4 py-3">
                  <span className="font-bold text-slate-800 dark:text-slate-200">{REASON_LABEL[reason]}</span>
                  <span className="font-black text-slate-900 dark:text-white">{marks(recoverable.byReason[reason])}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </section>
  );
}
