'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { ArrowLeft, Bookmark, Loader2 } from 'lucide-react';
import MathRenderer from '@/components/MathRenderer';
import TeacherQuestionTools from '@/components/smartbook/TeacherQuestionTools';
import { parseQuestionOptions } from '@/lib/arena-answer';

interface BookmarkedQuestion {
  id: string;
  content: string;
  options: unknown;
  correctAnswer: string | null;
  explanation: string | null;
  printedNumber: string | null;
  sourcePageStart: number | null;
  topic: string | null;
  book: { id: string; title: string } | null;
  bookChapter: { name: string } | null;
}

const LETTERS = ['A', 'B', 'C', 'D', 'E', 'F'];

/** A teacher's bookmarked questions, to add to tests or let go of. */
export default function BookmarksClient() {
  const [questions, setQuestions] = useState<BookmarkedQuestion[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/teacher/favorites')
      .then(async (res) => { const body = await res.json(); if (!res.ok) throw new Error(body.error || 'Could not load your bookmarks'); return body.questions as BookmarkedQuestion[]; })
      .then(setQuestions)
      .catch((e) => setError((e as Error).message));
  }, []);

  return (
    <main className="min-h-screen bg-slate-50 p-6 dark:bg-background md:p-10">
      <div className="mx-auto max-w-4xl">
        <Link href="/teacher/smartbook" className="mb-6 inline-flex items-center gap-2 text-sm font-bold text-indigo-700 dark:text-brand"><ArrowLeft className="h-4 w-4" />Smartbook</Link>
        <div className="mb-8 flex items-center gap-3">
          <Bookmark className="h-9 w-9 text-indigo-600 dark:text-brand" />
          <div>
            <h1 className="font-display text-3xl font-black text-slate-900 dark:text-white">My bookmarks</h1>
            <p className="text-slate-600 dark:text-slate-400">Questions you have saved from the books, newest first. Add any of them to a test you are putting together.</p>
          </div>
        </div>

        {error && <p role="alert" className="rounded-xl bg-rose-50 p-4 text-sm font-bold text-rose-700">{error}</p>}
        {!questions && !error && <p className="flex items-center gap-2 text-slate-500"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</p>}
        {questions?.length === 0 && (
          <p className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center text-slate-500 dark:border-white/10 dark:bg-surface">
            No bookmarks yet. Open an exercise in Smartbook and use Bookmark on any question.
          </p>
        )}

        <ul className="space-y-4">
          {questions?.map((q) => {
            const options = parseQuestionOptions(q.options);
            return (
              <li key={q.id} data-testid={`bookmarked-${q.id}`} className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-white/10 dark:bg-surface">
                <p className="mb-2 text-xs font-bold text-slate-500">
                  {[q.book?.title, q.bookChapter?.name ?? q.topic, q.printedNumber ? `Q${q.printedNumber}` : null, q.sourcePageStart != null ? `p. ${q.sourcePageStart}` : null].filter(Boolean).join(' · ')}
                </p>
                <div className="text-sm text-slate-900 dark:text-white"><MathRenderer content={q.content} /></div>
                {options.length > 0 && (
                  <ol className="mt-3 grid gap-1.5 text-sm sm:grid-cols-2">
                    {options.map((opt, i) => (
                      <li key={i} className={`flex gap-2 rounded-lg px-2 py-1 ${q.correctAnswer?.trim() === LETTERS[i] ? 'bg-emerald-50 font-bold text-emerald-900 dark:bg-emerald-500/10 dark:text-emerald-300' : 'text-slate-700 dark:text-slate-300'}`}>
                        <span className="font-black">{LETTERS[i]}</span><span className="min-w-0"><MathRenderer content={opt} /></span>
                      </li>
                    ))}
                  </ol>
                )}
                {(q.explanation || (q.correctAnswer && options.length === 0)) && (
                  <details className="mt-3 text-sm">
                    <summary className="cursor-pointer font-bold text-indigo-700 dark:text-brand">Answer and solution</summary>
                    <div className="mt-2 space-y-2 rounded-xl bg-slate-50 p-3 dark:bg-white/5">
                      {q.correctAnswer && options.length === 0 && <div className="flex flex-wrap items-baseline gap-1.5 font-bold"><span>Answer:</span> <MathRenderer content={q.correctAnswer} /></div>}
                      {q.explanation && <div className="text-slate-700 dark:text-slate-300"><MathRenderer content={q.explanation} /></div>}
                    </div>
                  </details>
                )}
                <div className="mt-4 border-t border-slate-100 pt-3 dark:border-white/10">
                  <TeacherQuestionTools
                    questionId={q.id}
                    bookmarked
                    onBookmarkChange={(on) => { if (!on) setQuestions((all) => all?.filter((x) => x.id !== q.id) ?? null); }}
                    newTestTitle={q.bookChapter?.name ? `${q.bookChapter.name} · selected questions` : 'Selected questions'}
                  />
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    </main>
  );
}
