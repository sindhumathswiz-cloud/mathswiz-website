'use client';

import { useMemo, type ReactNode } from 'react';
import { RotateCcw } from 'lucide-react';
import type { SourceBook } from '@/lib/question-source-filter';
import { DIFFICULTY_LABEL, STATUS_LABEL, TYPE_LABEL, type Facets, type Filters } from './filters';

const chip = (on: boolean) => `inline-flex items-center gap-1 rounded-lg border px-2.5 py-1 text-xs font-bold transition-colors ${on
  ? 'border-indigo-600 bg-indigo-600 text-white dark:border-brand dark:bg-brand'
  : 'border-slate-200 bg-white text-slate-700 hover:border-indigo-300 dark:border-white/10 dark:bg-surface dark:text-slate-300'}`;
const selectCls = 'w-full rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-sm text-slate-800 dark:border-white/10 dark:bg-surface dark:text-slate-200';
export const filterLabelCls = 'mb-1 block text-[10px] font-black uppercase tracking-widest text-slate-400 dark:text-slate-500';

/**
 * The question filters: class, book, chapter, exercise, topic, type, difficulty and worked solution, with how many
 * questions each type, difficulty and topic would give. Shared by Find Questions (a column beside the results) and
 * the admin Question Bank and Flagged Questions (a panel across the top: layout "bar").
 */
export default function QuestionFilterPanel({
  filters, onChange, onReset, active, books, facets, statusOptions, showMine = false, layout = 'column', children,
}: {
  filters: Filters;
  onChange: (patch: Partial<Filters>) => void;
  onReset: () => void;
  active: boolean;
  books: SourceBook[];
  facets: Facets | null;
  /** Statuses to choose from; leave out where the page has its own status tabs. */
  statusOptions?: string[];
  showMine?: boolean;
  layout?: 'column' | 'bar';
  /** Controls a page adds, shown with the rest. */
  children?: ReactNode;
}) {
  const book = books.find((b) => b.id === filters.bookId);
  const chapter = book?.chapters.find((c) => c.id === filters.bookChapterId);
  const classes = useMemo(() => [...new Set(['Class 11', 'Class 12', ...books.map((b) => b.className).filter(Boolean)])].sort(), [books]);
  const visibleBooks = filters.class ? books.filter((b) => b.className === filters.class) : books;
  const toggleIn = (key: 'types' | 'difficulties', value: string) =>
    onChange({ [key]: filters[key].includes(value) ? filters[key].filter((v) => v !== value) : [...filters[key], value] } as Partial<Filters>);
  const wide = layout === 'bar' ? 'sm:col-span-2' : '';

  return (
    <div className={layout === 'bar' ? 'grid gap-4 sm:grid-cols-2 lg:grid-cols-4' : 'space-y-4'}>
      <div className={`flex items-center justify-between ${layout === 'bar' ? 'sm:col-span-2 lg:col-span-4' : ''}`}>
        <h2 className="text-sm font-black text-slate-900 dark:text-white">Filters</h2>
        {active && (
          <button type="button" onClick={onReset} className="inline-flex items-center gap-1 text-xs font-bold text-indigo-600 dark:text-brand">
            <RotateCcw className="h-3.5 w-3.5" /> Clear all
          </button>
        )}
      </div>

      <label className="block">
        <span className={filterLabelCls}>Class</span>
        <select id="qb-class" value={filters.class} onChange={(e) => onChange({ class: e.target.value, bookId: '', bookChapterId: '', bookExerciseId: '' })} className={selectCls}>
          <option value="">All classes</option>
          {classes.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
      </label>
      <label className="block">
        <span className={filterLabelCls}>Book</span>
        <select id="qb-book" value={filters.bookId} onChange={(e) => onChange({ bookId: e.target.value, bookChapterId: '', bookExerciseId: '' })} className={selectCls}>
          <option value="">All books</option>
          {visibleBooks.map((b) => <option key={b.id} value={b.id}>{b.title} ({b.total})</option>)}
        </select>
      </label>
      {book && (
        <label className="block">
          <span className={filterLabelCls}>Chapter</span>
          <select id="qb-chapter" value={filters.bookChapterId} onChange={(e) => onChange({ bookChapterId: e.target.value, bookExerciseId: '' })} className={selectCls}>
            <option value="">All chapters</option>
            {book.chapters.map((c) => <option key={c.id} value={c.id}>{c.chapterNumber ? `${c.chapterNumber}. ` : ''}{c.name} ({c.total})</option>)}
          </select>
        </label>
      )}
      {chapter && chapter.exercises.length > 0 && (
        <label className="block">
          <span className={filterLabelCls}>Exercise</span>
          <select id="qb-exercise" value={filters.bookExerciseId} onChange={(e) => onChange({ bookExerciseId: e.target.value })} className={selectCls}>
            <option value="">All exercises</option>
            {chapter.exercises.map((x) => <option key={x.id} value={x.id}>{x.label} ({x.total})</option>)}
          </select>
        </label>
      )}

      <label className="block">
        <span className={filterLabelCls}>Topic</span>
        <select id="qb-topic" value={filters.topic} onChange={(e) => onChange({ topic: e.target.value })} className={selectCls}>
          <option value="">All topics</option>
          {filters.topic && !facets?.topics.some((t) => t.value === filters.topic) && <option value={filters.topic}>{filters.topic}</option>}
          {(facets?.topics ?? []).map((t) => <option key={t.value} value={t.value}>{t.value} ({t.count})</option>)}
        </select>
      </label>

      <label className="block">
        <span className={filterLabelCls}>Worked solution</span>
        <select id="qb-solution" value={filters.solution} onChange={(e) => onChange({ solution: e.target.value })} className={selectCls}>
          <option value="">With or without</option>
          <option value="with">Has a worked solution</option>
          <option value="without">No worked solution</option>
        </select>
      </label>

      {statusOptions && (
        <label className="block">
          <span className={filterLabelCls}>Status</span>
          <select id="qb-status" value={filters.status} onChange={(e) => onChange({ status: e.target.value })} className={selectCls}>
            {statusOptions.map((s) => <option key={s} value={s}>{STATUS_LABEL[s] ?? s}</option>)}
          </select>
        </label>
      )}
      {showMine && (
        <label className="flex items-center gap-2 self-end text-sm font-bold text-slate-700 dark:text-slate-300">
          <input id="qb-mine" type="checkbox" checked={filters.mine} onChange={(e) => onChange({ mine: e.target.checked })} /> Only questions I wrote
        </label>
      )}
      {children}

      <fieldset className={wide}>
        <legend className={filterLabelCls}>Question type</legend>
        <div className="flex flex-wrap gap-1.5">
          {(facets?.types ?? []).map((t) => (
            <button key={t.value} type="button" aria-pressed={filters.types.includes(t.value)} onClick={() => toggleIn('types', t.value)} className={chip(filters.types.includes(t.value))}>
              {TYPE_LABEL[t.value] ?? t.value} <span className="tabular-nums opacity-70">{t.count}</span>
            </button>
          ))}
          {filters.types.filter((v) => !facets?.types.some((t) => t.value === v)).map((v) => (
            <button key={v} type="button" aria-pressed onClick={() => toggleIn('types', v)} className={chip(true)}>{TYPE_LABEL[v] ?? v} <span className="opacity-70">0</span></button>
          ))}
        </div>
      </fieldset>

      <fieldset className={wide}>
        <legend className={filterLabelCls}>Difficulty</legend>
        <div className="flex flex-wrap gap-1.5">
          {['EASY', 'MEDIUM', 'HARD'].map((d) => {
            const count = facets?.difficulties.find((x) => x.value === d)?.count ?? 0;
            return (
              <button key={d} type="button" aria-pressed={filters.difficulties.includes(d)} onClick={() => toggleIn('difficulties', d)} className={chip(filters.difficulties.includes(d))}>
                {DIFFICULTY_LABEL[d]} <span className="tabular-nums opacity-70">{count}</span>
              </button>
            );
          })}
        </div>
      </fieldset>
    </div>
  );
}
