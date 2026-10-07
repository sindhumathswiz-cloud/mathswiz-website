'use client';

import type { ExamSection, ExamResponse, QuestionStatus } from '@/lib/exam-view';
import { statusCounts } from '@/lib/exam-view';

export const QUESTION_STATUS_LEGEND: Array<{ status: QuestionStatus; label: string; swatch: string }> = [
  { status: 'ANSWERED', label: 'Answered', swatch: 'bg-emerald-500 border-emerald-600' },
  { status: 'NOT_ANSWERED', label: 'Not answered', swatch: 'bg-rose-500 border-rose-600' },
  { status: 'NOT_VISITED', label: 'Not visited', swatch: 'bg-white dark:bg-surface border-slate-300 dark:border-white/20' },
  { status: 'MARKED_FOR_REVIEW', label: 'Marked for review', swatch: 'bg-indigo-600 border-indigo-700' },
  { status: 'ANSWERED_AND_MARKED', label: 'Answered & marked', swatch: 'bg-indigo-600 border-indigo-700 ring-2 ring-emerald-400 ring-offset-1' },
];

const CELL: Record<QuestionStatus, string> = {
  ANSWERED: 'bg-emerald-500 text-white border-emerald-600',
  NOT_ANSWERED: 'bg-rose-500 text-white border-rose-600',
  NOT_VISITED: 'bg-white dark:bg-surface text-slate-600 dark:text-slate-300 border-slate-300 dark:border-white/20',
  MARKED_FOR_REVIEW: 'bg-indigo-600 text-white border-indigo-700',
  ANSWERED_AND_MARKED: 'bg-indigo-600 text-white border-indigo-700 ring-2 ring-emerald-400 ring-offset-1 dark:ring-offset-surface-muted',
};

/**
 * The question palette for the section being answered: a legend with live counts
 * (the five statuses a student actually needs) and a numbered grid. Numbers run
 * from 1 within the section, matching the "Question 3 of 20" in the header.
 */
export default function ExamPalette({
  section, responses, currentIndex, onGo, onOverview, onSubmit, submitting,
}: {
  section: ExamSection;
  responses: Record<string, ExamResponse | undefined>;
  currentIndex: number;
  onGo: (flatIndex: number) => void;
  onOverview: () => void;
  onSubmit: () => void;
  submitting: boolean;
}) {
  const counts = statusCounts(section.questionIds, responses);
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="border-b border-slate-200 bg-white p-5 dark:border-white/10 dark:bg-surface">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 dark:text-slate-500">{section.title}</h3>
          <button type="button" onClick={onOverview} className="text-[11px] font-black text-indigo-600 hover:underline dark:text-brand">Overview</button>
        </div>
        <ul className="grid grid-cols-1 gap-2 text-[11px] font-bold text-slate-600 dark:text-slate-300 sm:grid-cols-2">
          {QUESTION_STATUS_LEGEND.map(item => (
            <li key={item.status} className="flex items-center gap-2">
              <span className={`h-4 w-4 shrink-0 rounded border ${item.swatch}`} aria-hidden />
              <span className="flex-1">{item.label}</span>
              <span className="tabular-nums text-slate-900 dark:text-white">{counts[item.status]}</span>
            </li>
          ))}
        </ul>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-5">
        <div className="grid grid-cols-5 gap-2.5" role="group" aria-label={`${section.title} questions`}>
          {section.questionIds.map((id, offset) => {
            const flatIndex = section.startIndex + offset;
            const status = responses[id]?.status ?? 'NOT_VISITED';
            const current = flatIndex === currentIndex;
            return (
              <button
                key={id}
                type="button"
                onClick={() => onGo(flatIndex)}
                aria-label={`Question ${offset + 1}, ${QUESTION_STATUS_LEGEND.find(item => item.status === status)?.label.toLowerCase()}`}
                aria-current={current ? 'true' : undefined}
                className={`flex aspect-square items-center justify-center rounded-lg border-2 text-xs font-black transition ${CELL[status]} ${current ? 'outline outline-2 outline-offset-2 outline-slate-900 dark:outline-white' : ''}`}
              >
                {offset + 1}
              </button>
            );
          })}
        </div>
      </div>

      <div className="border-t border-slate-200 bg-white p-5 dark:border-white/10 dark:bg-surface">
        <button
          type="button"
          onClick={onSubmit}
          disabled={submitting}
          className="w-full rounded-xl bg-rose-600 py-4 text-sm font-black uppercase tracking-widest text-white transition hover:bg-rose-700 disabled:opacity-50"
        >
          Review &amp; Submit
        </button>
      </div>
    </div>
  );
}
