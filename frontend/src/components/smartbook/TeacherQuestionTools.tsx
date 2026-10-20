'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { Bookmark, BookmarkCheck, ListPlus, Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';

interface DraftTest { id: string; title: string; questionCount: number }

/** The tests a teacher can still add questions to: their own, unpublished, and not reusable templates. */
let draftTestsPromise: Promise<DraftTest[]> | null = null;
export function loadDraftTests(force = false): Promise<DraftTest[]> {
  if (!draftTestsPromise || force) {
    draftTestsPromise = fetch('/api/teacher/tests/list')
      .then((res) => res.json())
      .then((body) => (body.tests ?? []).filter((t: { isPublished: boolean; templateType: string | null }) => !t.isPublished && !t.templateType)
        .map((t: DraftTest) => ({ id: t.id, title: t.title, questionCount: t.questionCount })))
      .catch(() => []);
  }
  return draftTestsPromise;
}

interface Props {
  questionId: string;
  bookmarked: boolean;
  onBookmarkChange: (bookmarked: boolean) => void;
  /** Suggested name for a new test started from this question. */
  newTestTitle: string;
}

/** Bookmark a question, or add it to one of the teacher's unpublished tests (or a new one). */
export default function TeacherQuestionTools({ questionId, bookmarked, onBookmarkChange, newTestTitle }: Props) {
  const [saving, setSaving] = useState(false);
  const [open, setOpen] = useState(false);
  const [tests, setTests] = useState<DraftTest[] | null>(null);
  const [title, setTitle] = useState(newTestTitle);
  const [adding, setAdding] = useState<string | null>(null);
  const [lastAdded, setLastAdded] = useState<{ id: string; title: string } | null>(null);
  const panel = useRef<HTMLDivElement>(null);

  useEffect(() => { setLastAdded(null); setOpen(false); setTitle(newTestTitle); }, [questionId, newTestTitle]);
  useEffect(() => {
    if (!open) return;
    // Fresh each time: a test made or published elsewhere since the page opened must show (or not) here.
    setTests(null);
    loadDraftTests(true).then(setTests);
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  const toggleBookmark = async () => {
    setSaving(true);
    try {
      const res = bookmarked
        ? await fetch(`/api/teacher/favorites?questionId=${encodeURIComponent(questionId)}`, { method: 'DELETE' })
        : await fetch('/api/teacher/favorites', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ questionId }) });
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(body?.error || 'Could not change the bookmark');
      onBookmarkChange(!bookmarked);
      toast.success(bookmarked ? 'Bookmark removed' : 'Bookmarked');
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const add = async (target: { testId: string } | { newTitle: string }) => {
    setAdding('testId' in target ? target.testId : 'new');
    try {
      const res = await fetch('/api/teacher/tests/collect', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ questionId, ...target }) });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || 'Could not add the question');
      toast.success(`Added to "${body.test.title}" (${body.questionCount} question${body.questionCount === 1 ? '' : 's'})`);
      setLastAdded(body.test);
      setOpen(false);
      setTests(await loadDraftTests(true));
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setAdding(null);
    }
  };

  return (
    <div className="relative flex flex-wrap items-center gap-x-5 gap-y-2">
      <button type="button" onClick={toggleBookmark} disabled={saving} aria-pressed={bookmarked} data-testid={`teacher-bookmark-${questionId}`} className={`flex items-center gap-2 text-xs font-black uppercase tracking-widest disabled:opacity-40 ${bookmarked ? 'text-indigo-600 dark:text-brand' : 'text-slate-500 hover:text-indigo-600 dark:text-slate-400'}`}>
        {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : bookmarked ? <BookmarkCheck className="h-4 w-4" /> : <Bookmark className="h-4 w-4" />}
        {bookmarked ? 'Bookmarked' : 'Bookmark'}
      </button>
      <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} data-testid={`add-to-test-${questionId}`} className="flex items-center gap-2 text-xs font-black uppercase tracking-widest text-slate-500 hover:text-indigo-600 dark:text-slate-400">
        <ListPlus className="h-4 w-4" /> Add to test
      </button>
      {lastAdded && (
        <Link href={`/teacher/tests/${lastAdded.id}/assign`} className="text-xs font-bold text-indigo-700 underline underline-offset-2 dark:text-brand">Open &ldquo;{lastAdded.title}&rdquo;</Link>
      )}

      {open && (
        <div ref={panel} role="dialog" aria-label="Add to a test" className="absolute bottom-full left-0 z-20 mb-2 w-80 max-w-[85vw] rounded-2xl border border-slate-200 bg-white p-3 shadow-xl dark:border-white/10 dark:bg-surface">
          <p className="px-1 pb-2 text-[10px] font-black uppercase tracking-widest text-slate-400">Your unpublished tests</p>
          {tests === null ? (
            <p className="flex items-center gap-2 px-1 py-2 text-sm text-slate-500"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</p>
          ) : tests.length === 0 ? (
            <p className="px-1 py-2 text-sm text-slate-500">None yet. Start one below.</p>
          ) : (
            <ul className="max-h-48 space-y-1 overflow-y-auto">
              {tests.map((t) => (
                <li key={t.id}>
                  <button type="button" onClick={() => add({ testId: t.id })} disabled={adding !== null} className="flex w-full items-center justify-between gap-3 rounded-lg px-2 py-1.5 text-left text-sm hover:bg-slate-50 disabled:opacity-50 dark:hover:bg-white/5">
                    <span className="min-w-0 truncate font-bold text-slate-800 dark:text-slate-200">{t.title}</span>
                    <span className="shrink-0 text-xs tabular-nums text-slate-500">{adding === t.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : `${t.questionCount} q`}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          <form onSubmit={(e) => { e.preventDefault(); if (title.trim()) add({ newTitle: title.trim() }); }} className="mt-3 border-t border-slate-100 pt-3 dark:border-white/10">
            <label htmlFor={`new-test-${questionId}`} className="px-1 text-[10px] font-black uppercase tracking-widest text-slate-400">Or start a new test</label>
            <div className="mt-1.5 flex gap-2">
              <input id={`new-test-${questionId}`} value={title} onChange={(e) => setTitle(e.target.value)} className="min-w-0 flex-1 rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm dark:border-white/15 dark:bg-white/5 dark:text-white" />
              <button type="submit" disabled={adding !== null || !title.trim()} className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-bold text-white disabled:opacity-50 dark:bg-brand">{adding === 'new' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Start'}</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
