'use client';

import { useEffect, useMemo, useState } from 'react';
import { BookOpen } from 'lucide-react';
import { reconcileSelection, type SourceBook } from '@/lib/question-source-filter';

export interface SourceSelection { bookId: string; chapterId: string; exerciseId: string }
export const NO_SOURCE: SourceSelection = { bookId: '', chapterId: '', exerciseId: '' };

/**
 * Book -> Chapter -> Exercise selectors for picking questions by where they sit
 * in a book. Only books, chapters and exercises that actually have approved
 * questions are offered, each with its question count, so a choice never leads
 * to an empty list. Choosing a higher level clears the levels beneath it.
 *
 * Renders nothing when there are no book-sourced questions or the list cannot be
 * loaded: the other filters keep working on their own.
 */
export default function QuestionSourceSelector({ value, onChange, className = '' }: { value: SourceSelection; onChange: (next: SourceSelection) => void; className?: string }) {
  const [books, setBooks] = useState<SourceBook[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/teacher/question-sources')
      .then(response => (response.ok ? response.json() : { books: [] }))
      .then(data => { if (!cancelled) setBooks(Array.isArray(data.books) ? data.books : []); })
      .catch(() => { if (!cancelled) setBooks([]); });
    return () => { cancelled = true; };
  }, []);

  const book = useMemo(() => books?.find(b => b.id === value.bookId) ?? null, [books, value.bookId]);
  const chapter = useMemo(() => book?.chapters.find(c => c.id === value.chapterId) ?? null, [book, value.chapterId]);

  if (!books || books.length === 0) return null;

  const set = (patch: Partial<SourceSelection>) => onChange(reconcileSelection(books, { ...value, ...patch }));
  const field = 'w-full rounded border bg-white p-2 text-sm outline-none focus:border-indigo-500 dark:border-white/10 dark:bg-white/5 dark:text-white';

  const exerciseTotal = chapter?.exercises.find(e => e.id === value.exerciseId)?.total;
  const shown = exerciseTotal ?? chapter?.total ?? book?.total ?? null;

  return (
    <div className={className} data-testid="question-source-selector">
      <div className="mb-1.5 flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest text-slate-500 dark:text-slate-400">
        <BookOpen className="h-3 w-3" /> From a book
        {shown !== null && <span className="ml-auto font-bold normal-case tracking-normal text-indigo-600 dark:text-brand">{shown} approved question{shown === 1 ? '' : 's'}</span>}
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <select aria-label="Book" value={value.bookId} onChange={e => set({ bookId: e.target.value, chapterId: '', exerciseId: '' })} className={field}>
          <option value="">All books</option>
          {books.map(b => <option key={b.id} value={b.id}>{b.title} ({b.className}) · {b.total}</option>)}
        </select>
        <select aria-label="Chapter" value={value.chapterId} disabled={!book} onChange={e => set({ chapterId: e.target.value, exerciseId: '' })} className={`${field} disabled:opacity-50`}>
          <option value="">{book ? 'All chapters' : 'Choose a book first'}</option>
          {book?.chapters.map(c => <option key={c.id} value={c.id}>{c.chapterNumber ? `${c.chapterNumber}. ` : ''}{c.name} · {c.total}</option>)}
        </select>
        <select aria-label="Exercise" value={value.exerciseId} disabled={!chapter || chapter.exercises.length === 0} onChange={e => set({ exerciseId: e.target.value })} className={`${field} disabled:opacity-50`}>
          <option value="">{!chapter ? 'Choose a chapter first' : chapter.exercises.length === 0 ? 'No exercises mapped' : 'All exercises'}</option>
          {chapter?.exercises.map(e => <option key={e.id} value={e.id}>{e.label} · {e.total}</option>)}
        </select>
      </div>
    </div>
  );
}
