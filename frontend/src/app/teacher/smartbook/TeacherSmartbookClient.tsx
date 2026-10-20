'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { BookOpenText, ChevronDown, ClipboardList, Eye, Loader2 } from 'lucide-react';
import { toast } from 'react-hot-toast';
import MathRenderer from '@/components/MathRenderer';
import type { SourceBook } from '@/lib/question-source-filter';

interface PreviewQuestion { id: string; content: string; printedNumber: string | null; sourcePageStart: number | null }

/** Books, their chapters and exercises; any exercise becomes a test or homework in one step. */
export default function TeacherSmartbookClient({ books }: { books: SourceBook[] }) {
  const router = useRouter();
  const [making, setMaking] = useState<string | null>(null);
  const [previewing, setPreviewing] = useState<string | null>(null);
  const [preview, setPreview] = useState<Record<string, PreviewQuestion[]>>({});

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

  const togglePreview = async (exerciseId: string) => {
    if (preview[exerciseId]) { setPreview(({ [exerciseId]: _, ...rest }) => rest); return; }
    setPreviewing(exerciseId);
    try {
      const res = await fetch(`/api/teacher/questions?bookExerciseId=${encodeURIComponent(exerciseId)}&limit=200`);
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || 'Could not load the questions');
      const approved = (body.questions ?? []).filter((q: { status: string }) => q.status === 'APPROVED');
      setPreview((all) => ({ ...all, [exerciseId]: approved }));
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setPreviewing(null);
    }
  };

  return (
    <main className="min-h-screen bg-slate-50 p-6 dark:bg-background md:p-10">
      <div className="mx-auto max-w-5xl">
        <div className="mb-8 flex items-center gap-3">
          <BookOpenText className="h-9 w-9 text-indigo-600 dark:text-brand" />
          <div>
            <h1 className="font-display text-3xl font-black text-slate-900 dark:text-white">Smartbook</h1>
            <p className="text-slate-600 dark:text-slate-400">Pick any exercise of a book and set it as a test or homework. Only approved questions are included, in the order the book prints them.</p>
          </div>
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
                            <button type="button" onClick={() => togglePreview(exercise.id)} disabled={previewing === exercise.id} aria-expanded={Boolean(preview[exercise.id])} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-50 dark:border-white/15 dark:text-slate-200 dark:hover:bg-white/5">
                              {previewing === exercise.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Eye className="h-3.5 w-3.5" />} {preview[exercise.id] ? 'Hide questions' : 'See questions'}
                            </button>
                            <button type="button" onClick={() => makeTest(exercise.id)} disabled={making !== null} data-testid={`make-test-${exercise.id}`} className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-indigo-500 disabled:opacity-50 dark:bg-brand">
                              {making === exercise.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ClipboardList className="h-3.5 w-3.5" />} Make a test
                            </button>
                          </div>
                          {preview[exercise.id] && (
                            <ol className="mt-3 space-y-2 border-t border-slate-100 pt-3 text-sm dark:border-white/10">
                              {preview[exercise.id].length === 0 && <li className="text-slate-500">No approved questions found.</li>}
                              {preview[exercise.id].map((q) => (
                                <li key={q.id} className="flex gap-3">
                                  <span className="w-10 shrink-0 text-xs font-bold text-slate-500">{q.printedNumber ? `Q${q.printedNumber}` : ''}</span>
                                  <span className="min-w-0 flex-1 text-slate-800 dark:text-slate-200"><MathRenderer content={q.content} /></span>
                                  {q.sourcePageStart != null && <span className="shrink-0 text-xs tabular-nums text-slate-400">p. {q.sourcePageStart}</span>}
                                </li>
                              ))}
                            </ol>
                          )}
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
