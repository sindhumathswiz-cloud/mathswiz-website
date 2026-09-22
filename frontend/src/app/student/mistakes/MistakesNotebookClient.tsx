'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, BookX, Loader2, Pin, RotateCcw, Trash2 } from 'lucide-react';
import toast from 'react-hot-toast';
import MathRenderer from '@/components/MathRenderer';
import { readJsonResponse } from '@/lib/http-json';

type Entry = {
  questionId: string;
  question: { id: string; content: string; topic: string | null; subject: string | null; difficulty: string };
  source: 'auto' | 'flagged' | 'both';
  missCount: number | null;
  dueAt: string | null;
  flaggedEntryId: string | null;
  flaggedAt: string | null;
  note: string | null;
};

function dueLabel(dueAt: string | null): string {
  if (!dueAt) return '';
  const diffMs = new Date(dueAt).getTime() - Date.now();
  const hours = Math.round(Math.abs(diffMs) / (60 * 60 * 1000));
  if (diffMs <= 0) return hours < 1 ? 'due now' : `due ${hours}h ago`;
  return hours < 24 ? `due in ${hours}h` : `due in ${Math.round(hours / 24)}d`;
}

export default function MistakesNotebookClient() {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [loading, setLoading] = useState(true);
  const [removingId, setRemovingId] = useState<string | null>(null);

  const load = () => {
    setLoading(true);
    fetch('/api/student/mistakes/notebook')
      .then((response) => response.json())
      .then((data) => setEntries(data.entries || []))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const remove = async (entryId: string) => {
    setRemovingId(entryId);
    try {
      const response = await fetch(`/api/student/mistakes/notebook/${entryId}`, { method: 'DELETE' });
      if (!response.ok) {
        const body = await readJsonResponse(response);
        toast.error(body?.error as string || 'Could not remove entry');
        return;
      }
      // For a "both" entry, only the flag half goes away -- the question is
      // still an auto-captured mistake until it's answered correctly again,
      // so it must stay in the list (now as source: 'auto').
      setEntries((prev) => prev.flatMap((e) => {
        if (e.flaggedEntryId !== entryId) return [e];
        if (e.source === 'flagged') return [];
        return [{ ...e, source: 'auto' as const, flaggedEntryId: null, flaggedAt: null, note: null }];
      }));
    } finally {
      setRemovingId(null);
    }
  };

  const dueCount = entries.filter((e) => e.dueAt && new Date(e.dueAt).getTime() <= Date.now()).length;

  return (
    <main className="min-h-screen bg-slate-50 dark:bg-background p-6 md:p-10">
      <div className="mx-auto max-w-4xl">
        <Link href="/student/dashboard" className="mb-6 inline-flex items-center gap-2 text-sm font-bold text-indigo-700 dark:text-brand">
          <ArrowLeft className="h-4 w-4" />Student dashboard
        </Link>
        <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <BookX className="h-9 w-9 text-indigo-600 dark:text-brand" />
            <div>
              <h1 className="font-display text-3xl font-black text-slate-900 dark:text-white">My Mistakes</h1>
              <p className="text-slate-600 dark:text-slate-400">Questions you got wrong, and questions you pinned for review.</p>
            </div>
          </div>
          {dueCount > 0 && (
            <Link href="/student/practice?mode=mistakes" className="inline-flex items-center gap-2 rounded-2xl bg-amber-500 dark:bg-accent-warm px-5 py-3 text-sm font-black text-white shadow-lg shadow-amber-200 dark:shadow-none hover:bg-amber-600 transition-colors">
              <RotateCcw className="h-4 w-4" />Review {dueCount} due now
            </Link>
          )}
        </div>

        {loading ? (
          <Loader2 className="mx-auto my-20 h-8 w-8 animate-spin text-indigo-600 dark:text-brand" />
        ) : entries.length === 0 ? (
          <div className="rounded-3xl border border-dashed dark:border-white/10 bg-white dark:bg-surface p-16 text-center font-bold text-slate-600 dark:text-slate-400">
            Nothing here yet — wrong answers land here automatically, and you can pin any question from Practice Arena.
          </div>
        ) : (
          <div className="space-y-4">
            {entries.map((entry) => (
              <div key={entry.questionId} data-testid={`mistake-${entry.questionId}`} className="rounded-2xl border dark:border-white/10 bg-white dark:bg-surface p-5">
                <div className="mb-2 flex flex-wrap items-center gap-2 text-xs font-black uppercase tracking-wide">
                  {(entry.source === 'auto' || entry.source === 'both') && (
                    <span className={`rounded-full px-2.5 py-1 ${entry.dueAt && new Date(entry.dueAt).getTime() <= Date.now() ? 'bg-amber-100 text-amber-700 dark:bg-accent-warm/10 dark:text-accent-warm' : 'bg-slate-100 text-slate-500 dark:bg-white/5 dark:text-slate-400'}`}>
                      {dueLabel(entry.dueAt)} · missed {entry.missCount}×
                    </span>
                  )}
                  {(entry.source === 'flagged' || entry.source === 'both') && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-indigo-100 dark:bg-brand/10 px-2.5 py-1 text-indigo-700 dark:text-brand"><Pin className="h-3 w-3" />pinned</span>
                  )}
                  {entry.question.topic && <span className="rounded-full bg-slate-100 dark:bg-white/5 px-2.5 py-1 text-slate-500 dark:text-slate-400">{entry.question.topic}</span>}
                </div>
                <div className="mb-3 text-sm text-slate-800 dark:text-slate-200"><MathRenderer content={entry.question.content} /></div>
                {entry.note && <p className="mb-3 text-xs italic text-slate-500 dark:text-slate-400">"{entry.note}"</p>}
                <div className="flex items-center gap-3">
                  <Link href={`/student/practice?mode=mistakes${entry.question.topic ? `&topic=${encodeURIComponent(entry.question.topic)}` : ''}`} className="text-xs font-black text-indigo-700 dark:text-brand hover:underline">
                    Practice this →
                  </Link>
                  {entry.flaggedEntryId && (
                    <button
                      type="button"
                      onClick={() => remove(entry.flaggedEntryId!)}
                      disabled={removingId === entry.flaggedEntryId}
                      className="inline-flex items-center gap-1 text-xs font-bold text-rose-600 dark:text-rose-400 hover:underline disabled:opacity-50"
                    >
                      <Trash2 className="h-3 w-3" />Remove from notebook
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
