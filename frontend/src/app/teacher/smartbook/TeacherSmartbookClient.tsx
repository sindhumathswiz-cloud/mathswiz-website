'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Bookmark, BookOpenText, ChevronDown, ClipboardList, Eye, Loader2 } from 'lucide-react';
import { toast } from 'react-hot-toast';
import type { SourceBook } from '@/lib/question-source-filter';

/** Books, their chapters and exercises; any exercise becomes a test or homework in one step. */
export default function TeacherSmartbookClient({ books }: { books: SourceBook[] }) {
  const router = useRouter();
  const [making, setMaking] = useState<string | null>(null);

  const makeTest = async (exerciseId: string) => {
    setMaking(exerciseId);
    try {
      const res = await fetch(`/api/teacher/exercises/${exerciseId}/test`, { method: 'POST' });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || 'Could not make the test');
      toast.success(`Test made with ${body.questionCount} questions. Publish and assign it here.`);
      router.push(`/teacher/tests/${body.test.id}/assign`);
    } catch (error) {
      toast.error((error as Error).message);
      setMaking(null);
    }
  };


  return (
    <main className="min-h-screen bg-slate-50 p-6 dark:bg-background md:p-10">
      <div className="mx-auto max-w-5xl">
        <div className="mb-8 flex items-center gap-3">
          <BookOpenText className="h-9 w-9 text-indigo-600 dark:text-brand" />
          <div>
            <h1 className="font-display text-3xl font-black text-slate-900 dark:text-white">Smartbook</h1>
            <p className="text-slate-600 dark:text-slate-400">Open any exercise of a book to go through its questions with their solutions, bookmark them or add them to a test, or set the whole exercise as a test or homework. Only approved questions are included, in the order the book prints them.</p>
          </div>
          <Link href="/teacher/smartbook/bookmarks" data-testid="my-bookmarks" className="ml-auto inline-flex shrink-0 items-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-bold text-slate-700 hover:bg-slate-50 dark:border-white/15 dark:bg-surface dark:text-slate-200"><Bookmark className="h-4 w-4" /> My bookmarks</Link>
        </div>

        {books.length === 0 && (
          <p className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center text-slate-500 dark:border-white/10 dark:bg-surface">No book has approved questions yet.</p>
        )}

        <div className="space-y-6">
          {books.map((book) => (
            <section key={book.id} aria-labelledby={`b-${book.id}`} className="rounded-2xl border border-slate-200 bg-white dark:border-white/10 dark:bg-surface">
              <header className="flex flex-wrap items-baseline justify-between gap-2 border-b border-slate-100 px-5 py-4 dark:border-white/10">
                <h2 id={`b-${book.id}`} className="font-display text-xl font-black text-slate-900 dark:text-white">{book.title}</h2>
                <span className="text-sm text-slate-500">{book.className} · {book.total} approved questions</span>
              </header>
              <div className="divide-y divide-slate-100 dark:divide-white/10">
                {book.chapters.map((chapter) => (
                  <details key={chapter.id} className="group">
                    <summary className="flex cursor-pointer list-none items-center gap-3 px-5 py-3.5 hover:bg-slate-50 dark:hover:bg-white/5">
                      <ChevronDown className="h-4 w-4 shrink-0 text-slate-400 transition-transform group-open:rotate-180" />
                      <span className="min-w-0 flex-1 font-bold text-slate-800 dark:text-slate-200">{chapter.chapterNumber ? `${chapter.chapterNumber}. ` : ''}{chapter.name}</span>
                      <span className="text-xs tabular-nums text-slate-500">{chapter.exercises.length} exercises · {chapter.total} questions</span>
                    </summary>
                    <ul className="space-y-2 px-5 pb-4">
                      {chapter.exercises.length === 0 && <li className="text-sm text-slate-500">This chapter&apos;s questions are not divided into exercises yet.</li>}
                      {chapter.exercises.map((exercise) => (
                        <li key={exercise.id} data-testid={`teacher-exercise-${exercise.id}`} className="rounded-xl border border-slate-200 p-3 dark:border-white/10">
                          <div className="flex flex-wrap items-center gap-3">
                            <span className="min-w-0 flex-1 font-bold text-slate-900 dark:text-white">{exercise.label}</span>
                            <span className="text-xs tabular-nums text-slate-500">{exercise.total} questions</span>
                            <Link href={`/teacher/smartbook/${book.id}/exercises/${exercise.id}`} data-testid={`open-exercise-${exercise.id}`} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-50 dark:border-white/15 dark:text-slate-200 dark:hover:bg-white/5">
                              <Eye className="h-3.5 w-3.5" /> Open
                            </Link>
                            <button type="button" onClick={() => makeTest(exercise.id)} disabled={making !== null} data-testid={`make-test-${exercise.id}`} className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-indigo-500 disabled:opacity-50 dark:bg-brand">
                              {making === exercise.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ClipboardList className="h-3.5 w-3.5" />} Make a test
                            </button>
                          </div>
                        </li>
                      ))}
                    </ul>
                  </details>
                ))}
              </div>
            </section>
          ))}
        </div>
      </div>
    </main>
  );
}
