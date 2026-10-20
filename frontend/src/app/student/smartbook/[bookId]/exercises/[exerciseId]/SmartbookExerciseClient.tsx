'use client';

import Link from 'next/link';
import { useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, BookOpen, CheckCircle2, Eye, Loader2, XCircle } from 'lucide-react';
import MathRenderer from '@/components/MathRenderer';
import { parseQuestionOptions } from '@/lib/arena-answer';

interface Question {
  id: string;
  content: string;
  type: string;
  options: unknown;
  printedNumber: string | null;
  sourcePageStart: number | null;
}

interface ExerciseData {
  book: { id: string; title: string };
  chapter: { id: string; name: string; chapterNumber: string | null };
  exercise: { id: string; label: string; startPage: number | null; endPage: number | null };
  pages: number[];
  questions: Question[];
  previous: { id: string; label: string } | null;
  next: { id: string; label: string } | null;
}

interface Attempt {
  selected: string;
  checking: boolean;
  isCorrect: boolean | null;
  solution: { correctAnswer: string | null; explanation: string | null } | null;
  error: string | null;
}

const LETTERS = ['A', 'B', 'C', 'D', 'E', 'F'];
const emptyAttempt: Attempt = { selected: '', checking: false, isCorrect: null, solution: null, error: null };

/** How a question is answered here: by picking an option, typing a number, or (written answers) checking yourself. */
function answerKind(q: Question): { kind: 'choice'; options: string[] } | { kind: 'number' } | { kind: 'written' } {
  const options = parseQuestionOptions(q.options);
  if (options.length >= 2) return { kind: 'choice', options };
  if (q.type === 'INTEGER') return { kind: 'number' };
  return { kind: 'written' };
}

export default function SmartbookExerciseClient({ data }: { data: ExerciseData }) {
  const [attempts, setAttempts] = useState<Record<string, Attempt>>({});
  const [view, setView] = useState<'questions' | 'pages'>('questions');
  const shownAt = useRef<Record<string, number>>({});
  const pagesRef = useRef<HTMLDivElement>(null);

  const attemptOf = (id: string) => attempts[id] ?? emptyAttempt;
  const update = (id: string, patch: Partial<Attempt>) => setAttempts((all) => ({ ...all, [id]: { ...(all[id] ?? emptyAttempt), ...patch } }));
  const started = (id: string) => { if (shownAt.current[id] == null) shownAt.current[id] = Date.now(); };

  const fetchSolution = async (id: string) => {
    const res = await fetch(`/api/student/smartbook/questions/${id}/solution`);
    const body = await res.json();
    if (!res.ok) throw new Error(body.error || 'Could not load the answer');
    return body as Attempt['solution'];
  };

  const check = async (q: Question) => {
    const attempt = attemptOf(q.id);
    if (!attempt.selected.trim()) return;
    update(q.id, { checking: true, error: null });
    try {
      const timeSpent = Math.max(1, Math.round((Date.now() - (shownAt.current[q.id] ?? Date.now())) / 1000));
      const res = await fetch('/api/student/practice/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ questionId: q.id, selectedOption: attempt.selected.trim(), timeSpent }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || 'Could not check your answer');
      update(q.id, { isCorrect: Boolean(body.isCorrect), solution: await fetchSolution(q.id), checking: false });
    } catch (error) {
      update(q.id, { checking: false, error: (error as Error).message });
    }
  };

  const reveal = async (q: Question) => {
    update(q.id, { checking: true, error: null });
    try {
      update(q.id, { solution: await fetchSolution(q.id), checking: false });
    } catch (error) {
      update(q.id, { checking: false, error: (error as Error).message });
    }
  };

  const showPage = (page: number | null) => {
    if (page == null) return;
    setView('pages');
    requestAnimationFrame(() => document.getElementById(`page-${page}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  };

  const answered = data.questions.filter((q) => attemptOf(q.id).isCorrect != null).length;
  const correct = data.questions.filter((q) => attemptOf(q.id).isCorrect).length;
  const pageRange = data.exercise.startPage == null ? '' : data.exercise.endPage != null && data.exercise.endPage !== data.exercise.startPage ? `pp. ${data.exercise.startPage}–${data.exercise.endPage}` : `p. ${data.exercise.startPage}`;

  return (
    <main className="min-h-screen bg-slate-50 dark:bg-background">
      <header className="border-b border-slate-200 bg-white px-4 py-4 dark:border-white/10 dark:bg-surface md:px-8">
        <Link href={`/student/smartbook/${data.book.id}`} className="inline-flex items-center gap-2 text-sm font-bold text-indigo-700 dark:text-brand">
          <ArrowLeft className="h-4 w-4" />{data.book.title}
        </Link>
        <div className="mt-2 flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-slate-500">{data.chapter.chapterNumber ? `${data.chapter.chapterNumber}. ` : ''}{data.chapter.name}</p>
            <h1 className="font-display text-2xl font-black text-slate-900 dark:text-white">{data.exercise.label}</h1>
            {pageRange && <p className="text-sm text-slate-500">{pageRange} · {data.questions.length} questions</p>}
          </div>
          <p role="status" data-testid="smartbook-progress" className="rounded-full bg-indigo-50 px-3 py-1.5 text-sm font-bold tabular-nums text-indigo-800 dark:bg-brand/10 dark:text-brand">
            {answered} answered · {correct} right
          </p>
        </div>
        <div role="tablist" aria-label="What to show" className="mt-4 flex gap-1 lg:hidden">
          {(['questions', 'pages'] as const).map((tab) => (
            <button key={tab} role="tab" type="button" aria-selected={view === tab} onClick={() => setView(tab)} className={`rounded-lg px-3 py-1.5 text-sm font-bold ${view === tab ? 'bg-slate-900 text-white dark:bg-white/15' : 'text-slate-600 dark:text-slate-400'}`}>
              {tab === 'questions' ? 'Questions' : 'Book pages'}
            </button>
          ))}
        </div>
      </header>

      <div className="grid gap-6 p-4 md:p-8 lg:grid-cols-2">
        {/* The printed pages */}
        <section aria-label="Book pages" className={`${view === 'pages' ? 'block' : 'hidden'} lg:block`}>
          <div ref={pagesRef} className="space-y-4 lg:sticky lg:top-4 lg:max-h-[calc(100vh-2rem)] lg:overflow-y-auto lg:pr-2">
            {data.pages.length === 0 && <p className="text-sm text-slate-500">This exercise has no page range recorded.</p>}
            {data.pages.map((page) => (
              <figure key={page} id={`page-${page}`} className="scroll-mt-4 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm dark:border-white/10">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={`/api/student/smartbook/${data.book.id}/pages/${page}`} alt={`Page ${page}`} loading="lazy" className="block w-full" />
                <figcaption className="border-t border-slate-100 px-3 py-1.5 text-center text-xs font-bold tabular-nums text-slate-500 dark:border-white/10">Page {page}</figcaption>
              </figure>
            ))}
          </div>
        </section>

        {/* The questions */}
        <section aria-label="Questions" className={`${view === 'questions' ? 'block' : 'hidden'} space-y-4 lg:block`}>
          {data.questions.map((q, index) => {
            const attempt = attemptOf(q.id);
            const how = answerKind(q);
            const done = attempt.isCorrect != null || attempt.solution != null;
            return (
              <article key={q.id} data-testid={`smartbook-question-${q.id}`} onFocus={() => started(q.id)} onMouseEnter={() => started(q.id)} className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-white/10 dark:bg-surface">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <span className="text-xs font-black uppercase tracking-wider text-slate-500">Q {q.printedNumber || index + 1}</span>
                  {q.sourcePageStart != null && (
                    <button type="button" onClick={() => showPage(q.sourcePageStart)} className="inline-flex items-center gap-1 text-xs font-bold text-indigo-700 hover:underline dark:text-brand">
                      <BookOpen className="h-3.5 w-3.5" /> See it on page {q.sourcePageStart}
                    </button>
                  )}
                </div>
                <div className="text-sm text-slate-800 dark:text-slate-200"><MathRenderer content={q.content} /></div>

                {how.kind === 'choice' && (
                  <fieldset className="mt-4 space-y-2" disabled={done || attempt.checking}>
                    <legend className="sr-only">Choose an answer</legend>
                    {how.options.map((option, i) => {
                      const letter = LETTERS[i] ?? String(i + 1);
                      const picked = attempt.selected === letter;
                      const isAnswer = attempt.solution?.correctAnswer?.trim() === letter;
                      return (
                        <label key={letter} className={`flex cursor-pointer items-start gap-3 rounded-xl border px-3 py-2.5 text-sm ${isAnswer ? 'border-emerald-400 bg-emerald-50 dark:bg-emerald-500/10' : picked ? 'border-indigo-400 bg-indigo-50 dark:border-brand/50 dark:bg-brand/10' : 'border-slate-200 hover:bg-slate-50 dark:border-white/10 dark:hover:bg-white/5'}`}>
                          <input type="radio" name={`q-${q.id}`} value={letter} checked={picked} onChange={() => { started(q.id); update(q.id, { selected: letter }); }} className="mt-1" />
                          <span className="font-bold text-slate-500">{letter}</span>
                          <span className="min-w-0 flex-1 text-slate-800 dark:text-slate-200"><MathRenderer content={option} /></span>
                        </label>
                      );
                    })}
                  </fieldset>
                )}

                {how.kind === 'number' && (
                  <div className="mt-4">
                    <label htmlFor={`a-${q.id}`} className="text-xs font-bold text-slate-600 dark:text-slate-400">Your answer</label>
                    <input id={`a-${q.id}`} inputMode="decimal" value={attempt.selected} disabled={done || attempt.checking} onChange={(e) => { started(q.id); update(q.id, { selected: e.target.value }); }} className="mt-1 block w-40 rounded-lg border border-slate-300 px-3 py-2 text-sm tabular-nums dark:border-white/15 dark:bg-white/5 dark:text-white" />
                  </div>
                )}

                <div className="mt-4 flex flex-wrap items-center gap-3">
                  {how.kind !== 'written' && !done && (
                    <button type="button" onClick={() => check(q)} disabled={!attempt.selected.trim() || attempt.checking} className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2 text-sm font-bold text-white hover:bg-indigo-500 disabled:opacity-50 dark:bg-brand">
                      {attempt.checking && <Loader2 className="h-4 w-4 animate-spin" />} Check answer
                    </button>
                  )}
                  {how.kind === 'written' && !done && (
                    <button type="button" onClick={() => reveal(q)} disabled={attempt.checking} className="inline-flex items-center gap-2 rounded-xl border border-slate-300 px-4 py-2 text-sm font-bold text-slate-800 hover:bg-slate-50 disabled:opacity-50 dark:border-white/15 dark:text-white dark:hover:bg-white/5">
                      {attempt.checking ? <Loader2 className="h-4 w-4 animate-spin" /> : <Eye className="h-4 w-4" />} Work it out, then show the answer
                    </button>
                  )}
                  {attempt.isCorrect === true && <span className="inline-flex items-center gap-1.5 text-sm font-bold text-emerald-700 dark:text-emerald-400"><CheckCircle2 className="h-4 w-4" /> Right</span>}
                  {attempt.isCorrect === false && <span className="inline-flex items-center gap-1.5 text-sm font-bold text-rose-700 dark:text-rose-400"><XCircle className="h-4 w-4" /> Not quite: it goes into My Mistakes for another try later</span>}
                  {attempt.error && <span role="alert" className="text-sm font-bold text-rose-700 dark:text-rose-400">{attempt.error}</span>}
                </div>

                {attempt.solution && (
                  <div data-testid={`smartbook-solution-${q.id}`} className="mt-4 rounded-xl bg-slate-50 p-4 text-sm dark:bg-white/5">
                    {attempt.solution.correctAnswer && (
                      <p className="font-bold text-slate-900 dark:text-white">Answer: <span className="font-normal"><MathRenderer content={attempt.solution.correctAnswer} /></span></p>
                    )}
                    {attempt.solution.explanation ? (
                      <div className="mt-2 text-slate-700 dark:text-slate-300"><MathRenderer content={attempt.solution.explanation} /></div>
                    ) : (
                      <p className="mt-2 text-slate-500">No worked solution yet{q.sourcePageStart != null ? '; the book may print one in its answers section' : ''}.</p>
                    )}
                  </div>
                )}
              </article>
            );
          })}

          <nav aria-label="Other exercises" className="flex flex-wrap justify-between gap-3 pt-2">
            {data.previous ? (
              <Link href={`/student/smartbook/${data.book.id}/exercises/${data.previous.id}`} className="inline-flex items-center gap-2 text-sm font-bold text-indigo-700 dark:text-brand"><ArrowLeft className="h-4 w-4" />{data.previous.label}</Link>
            ) : <span />}
            {data.next && (
              <Link href={`/student/smartbook/${data.book.id}/exercises/${data.next.id}`} className="inline-flex items-center gap-2 text-sm font-bold text-indigo-700 dark:text-brand">{data.next.label}<ArrowRight className="h-4 w-4" /></Link>
            )}
          </nav>
        </section>
      </div>
    </main>
  );
}
