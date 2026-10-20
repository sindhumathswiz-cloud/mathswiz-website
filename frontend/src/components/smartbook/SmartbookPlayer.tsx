'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { AlertTriangle, ArrowLeft, ArrowRight, Bookmark, BookOpen, CheckCircle2, ChevronLeft, ChevronRight, Eye, Loader2, MessageSquareQuote, Pin, SkipForward, X, XCircle, Zap } from 'lucide-react';
import toast from 'react-hot-toast';
import MathRenderer from '@/components/MathRenderer';
import { parseQuestionOptions } from '@/lib/arena-answer';

/**
 * A book exercise, one question at a time, in the Practice window's style: the question and its options, the answer
 * checked, and the worked solution straight below; Previous/Next and a palette to move around; the printed page in a
 * panel on request. Students get Practice's own tools (hint, save for later, bookmark, report) and are checked on
 * the server; teachers see the answer and solution at once and get their own tools (renderTeacherTools).
 */

export interface PlayerQuestion {
  id: string;
  content: string;
  type: string;
  options: unknown;
  printedNumber: string | null;
  sourcePageStart: number | null;
  /** Teachers only: sent with the question. Students get them after an attempt. */
  correctAnswer?: string | null;
  explanation?: string | null;
}

interface Solution { correctAnswer: string | null; explanation: string | null }

interface QuestionState {
  selected: string;
  verdict: boolean | null; // right / wrong once checked
  solution: Solution | null;
  busy: boolean;
}

export interface SmartbookPlayerProps {
  mode: 'student' | 'teacher';
  /** Where "back" goes and what it says. */
  backHref: string;
  backLabel: string;
  eyebrow: string;
  title: string;
  pages: number[];
  pageImageUrl: (page: number) => string;
  questions: PlayerQuestion[];
  /** Key under which the current question is remembered on this device. */
  storageKey: string;
  previous?: { href: string; label: string } | null;
  next?: { href: string; label: string } | null;
  renderTeacherTools?: (question: PlayerQuestion) => ReactNode;
}

const LETTERS = ['A', 'B', 'C', 'D', 'E', 'F'];
const empty: QuestionState = { selected: '', verdict: null, solution: null, busy: false };

export function answerKind(q: Pick<PlayerQuestion, 'options' | 'type'>): 'choice' | 'number' | 'written' {
  if (parseQuestionOptions(q.options).length >= 2) return 'choice';
  if (q.type === 'INTEGER') return 'number';
  return 'written';
}

function readIndex(key: string, max: number): number {
  try {
    const value = Number(window.localStorage.getItem(key));
    return Number.isInteger(value) && value >= 0 && value < max ? value : 0;
  } catch { return 0; }
}

export default function SmartbookPlayer(props: SmartbookPlayerProps) {
  const { mode, questions } = props;
  const [index, setIndex] = useState(0);
  const [states, setStates] = useState<Record<string, QuestionState>>({});
  const [showPage, setShowPage] = useState(false);
  const [pageAt, setPageAt] = useState<number | null>(null);
  const [hint, setHint] = useState<{ id: string; text: string } | null>(null);
  const [hintLoading, setHintLoading] = useState(false);
  const [reporting, setReporting] = useState<{ reason: string; busy: boolean } | null>(null);
  const [startedAt, setStartedAt] = useState(() => Date.now());

  useEffect(() => { setIndex(readIndex(props.storageKey, questions.length)); }, [props.storageKey, questions.length]);
  useEffect(() => {
    try { window.localStorage.setItem(props.storageKey, String(index)); } catch { /* not remembered: fine */ }
    setStartedAt(Date.now());
    setHint(null);
    setPageAt(questions[index]?.sourcePageStart ?? props.pages[0] ?? null);
  }, [index, props.storageKey, props.pages, questions]);

  const q = questions[index];
  const state = (q && states[q.id]) || empty;
  const kind = q ? answerKind(q) : 'written';
  const options = useMemo(() => (q ? parseQuestionOptions(q.options) : []), [q]);
  const update = (id: string, patch: Partial<QuestionState>) => setStates((all) => ({ ...all, [id]: { ...(all[id] ?? empty), ...patch } }));

  // Teachers see the answer and the working with the question.
  const solution: Solution | null = mode === 'teacher' && q ? { correctAnswer: q.correctAnswer ?? null, explanation: q.explanation ?? null } : state.solution;
  const answered = questions.filter((x) => states[x.id]?.verdict != null).length;
  const right = questions.filter((x) => states[x.id]?.verdict === true).length;

  const loadSolution = async (id: string): Promise<Solution> => {
    const res = await fetch(`/api/student/smartbook/questions/${id}/solution`);
    const body = await res.json();
    if (!res.ok) throw new Error(body.error || 'Could not load the solution');
    return body;
  };

  const verify = async () => {
    if (!q || !state.selected.trim() || state.busy) return;
    update(q.id, { busy: true });
    try {
      const res = await fetch('/api/student/practice/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ questionId: q.id, selectedOption: state.selected.trim(), timeSpent: Math.max(1, Math.round((Date.now() - startedAt) / 1000)) }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || 'Could not check your answer');
      const verdict = Boolean(body.isCorrect);
      update(q.id, { verdict, solution: await loadSolution(q.id), busy: false });
      if (verdict) toast.success('Correct!'); else toast.error('Not quite. The solution is below; it goes into My Mistakes for another try.');
    } catch (error) {
      update(q.id, { busy: false });
      toast.error((error as Error).message);
    }
  };

  const reveal = async () => {
    if (!q || state.busy) return;
    update(q.id, { busy: true });
    try {
      update(q.id, { solution: await loadSolution(q.id), busy: false });
    } catch (error) {
      update(q.id, { busy: false });
      toast.error((error as Error).message);
    }
  };

  const skip = async () => {
    if (!q) return;
    try {
      await fetch('/api/student/practice/submit', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ questionId: q.id, skipped: true, timeSpent: Math.max(1, Math.round((Date.now() - startedAt) / 1000)) }) });
    } catch { /* a skip that is not recorded costs nothing */ }
    go(1);
  };

  const studentAction = async (url: string, body: unknown, ok: string, fail: string) => {
    try {
      const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error || fail);
      toast.success(ok);
      return true;
    } catch (error) {
      toast.error((error as Error).message || fail);
      return false;
    }
  };

  const getHint = async () => {
    if (!q || hintLoading) return;
    setHintLoading(true);
    try {
      const res = await fetch('/api/student/practice/hint', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ questionContent: q.content }) });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.hint) throw new Error();
      setHint({ id: q.id, text: data.hint });
    } catch {
      toast.error('Doubt Buddy is busy. Try again in a moment.');
    } finally {
      setHintLoading(false);
    }
  };

  const go = (step: number) => setIndex((i) => Math.min(questions.length - 1, Math.max(0, i + step)));

  if (!q) {
    return <main className="min-h-screen bg-slate-50 p-10 text-center text-slate-500 dark:bg-background">This exercise has no questions to show yet.</main>;
  }

  const done = mode === 'teacher' || state.verdict != null || state.solution != null;
  const answerLetter = solution?.correctAnswer?.trim() ?? '';
  const pageIndex = pageAt != null ? props.pages.indexOf(pageAt) : -1;

  return (
    <main className="min-h-screen bg-[#F8FAFC] pb-20 dark:bg-background">
      {/* Top bar */}
      <div className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 backdrop-blur dark:border-white/10 dark:bg-surface/95">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-3 md:px-6">
          <div className="min-w-0">
            <Link href={props.backHref} className="inline-flex items-center gap-1.5 text-xs font-bold text-indigo-700 dark:text-brand"><ArrowLeft className="h-3.5 w-3.5" />{props.backLabel}</Link>
            <p className="truncate text-[10px] font-black uppercase tracking-widest text-slate-400 dark:text-slate-500">{props.eyebrow}</p>
            <h1 className="truncate font-display text-lg font-black text-slate-900 dark:text-white">{props.title}</h1>
          </div>
          <div className="flex items-center gap-3">
            {mode === 'student' && (
              <p role="status" data-testid="smartbook-progress" className="rounded-full bg-indigo-50 px-3 py-1.5 text-xs font-black tabular-nums text-indigo-800 dark:bg-brand/10 dark:text-brand">{answered} answered · {right} right</p>
            )}
            <button type="button" onClick={() => setShowPage((v) => !v)} aria-pressed={showPage} data-testid="toggle-page" className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-xs font-black uppercase tracking-widest text-slate-700 hover:bg-slate-50 dark:border-white/10 dark:text-slate-200 dark:hover:bg-white/5">
              <BookOpen className="h-4 w-4" /> {showPage ? 'Hide page' : 'Show page'}
            </button>
          </div>
        </div>
        {/* Palette */}
        <nav aria-label="Questions" className="mx-auto max-w-6xl overflow-x-auto px-4 pb-3 md:px-6">
          <ol className="flex gap-1.5">
            {questions.map((item, i) => {
              const s = states[item.id];
              const tone = s?.verdict === true ? 'bg-emerald-500 text-white border-emerald-500' : s?.verdict === false ? 'bg-rose-500 text-white border-rose-500' : s?.solution ? 'bg-slate-300 text-slate-800 border-slate-300 dark:bg-white/20 dark:text-white' : 'bg-white text-slate-600 border-slate-200 dark:bg-white/5 dark:text-slate-300 dark:border-white/10';
              return (
                <li key={item.id}>
                  <button type="button" onClick={() => setIndex(i)} aria-current={i === index ? 'step' : undefined} aria-label={`Question ${item.printedNumber || i + 1}`} className={`h-8 min-w-8 rounded-lg border px-2 text-xs font-black tabular-nums ${tone} ${i === index ? 'ring-2 ring-indigo-500 ring-offset-1 dark:ring-brand dark:ring-offset-background' : ''}`}>
                    {item.printedNumber || i + 1}
                  </button>
                </li>
              );
            })}
          </ol>
        </nav>
      </div>

      <div className={`mx-auto mt-8 grid max-w-6xl gap-6 px-4 md:px-6 ${showPage ? 'lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]' : ''}`}>
        <div className="space-y-6">
          {/* Question card, as in Practice */}
          <article data-testid={`smartbook-question-${q.id}`} className="relative overflow-hidden rounded-[32px] border border-slate-200 bg-white p-6 shadow-sm dark:border-white/10 dark:bg-surface md:p-10">
            <div className="mb-6 flex flex-wrap items-center gap-2">
              <span className="rounded-full bg-indigo-50 px-3 py-1 text-[10px] font-black uppercase tracking-widest text-indigo-700 dark:bg-brand/10 dark:text-brand">Question {q.printedNumber || index + 1} · {index + 1} of {questions.length}</span>
              {q.sourcePageStart != null && <span className="rounded-full bg-slate-100 px-3 py-1 text-[10px] font-black uppercase tracking-widest text-slate-500 dark:bg-white/5 dark:text-slate-400">Page {q.sourcePageStart}</span>}
            </div>
            <div className="mb-8 text-lg font-bold leading-relaxed text-slate-900 dark:text-white md:text-xl"><MathRenderer content={q.content} /></div>

            {kind === 'choice' && (
              <div className="grid grid-cols-1 gap-3" role="radiogroup" aria-label="Options">
                {options.map((opt, i) => {
                  const letter = LETTERS[i] ?? String(i + 1);
                  const picked = state.selected === letter;
                  const isAnswer = done && letter === answerLetter;
                  const isWrongPick = done && picked && state.verdict === false;
                  return (
                    <button
                      key={letter}
                      type="button"
                      role="radio"
                      aria-checked={picked}
                      data-testid={`option-${letter}`}
                      aria-label={`Option ${letter}`}
                      disabled={done || state.busy}
                      onClick={() => update(q.id, { selected: letter })}
                      className={`group flex items-center gap-5 rounded-2xl border-2 p-4 text-left transition-all ${isAnswer ? 'border-emerald-500 bg-emerald-50/50 dark:border-emerald-500/60 dark:bg-emerald-500/10' : isWrongPick ? 'border-rose-500 bg-rose-50/50 dark:border-rose-500/60 dark:bg-rose-500/10' : picked ? 'border-indigo-600 bg-indigo-50/30 dark:border-brand dark:bg-brand/10' : 'border-slate-100 hover:border-indigo-300 hover:bg-slate-50/50 dark:border-white/10 dark:hover:border-brand/40 dark:hover:bg-white/5'}`}
                    >
                      <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border-2 text-sm font-black ${isAnswer ? 'border-emerald-500 bg-emerald-500 text-white' : isWrongPick ? 'border-rose-500 bg-rose-500 text-white' : picked ? 'border-indigo-600 bg-indigo-600 text-white dark:border-brand dark:bg-brand' : 'border-slate-200 bg-white text-slate-400 dark:border-white/10 dark:bg-white/5 dark:text-slate-500'}`}>{letter}</span>
                      <span className="min-w-0 flex-1 text-base font-bold text-slate-700 dark:text-slate-300"><MathRenderer content={opt} /></span>
                    </button>
                  );
                })}
              </div>
            )}

            {kind === 'number' && mode === 'student' && (
              <div>
                <label htmlFor={`a-${q.id}`} className="ml-1 block text-[10px] font-black uppercase tracking-widest text-slate-400 dark:text-slate-500">Your answer</label>
                <input id={`a-${q.id}`} inputMode="decimal" value={state.selected} disabled={done || state.busy} onChange={(e) => update(q.id, { selected: e.target.value })} className="mt-1.5 w-48 rounded-2xl border-2 border-slate-100 bg-slate-50 px-4 py-3 text-lg font-bold tabular-nums text-slate-900 focus:border-indigo-400 focus:bg-white focus:outline-none dark:border-white/10 dark:bg-white/5 dark:text-white" />
              </div>
            )}

            {kind === 'written' && mode === 'student' && !done && (
              <p className="rounded-2xl bg-slate-50 p-4 text-sm font-medium text-slate-600 dark:bg-white/5 dark:text-slate-300">Work this one out in your notebook, then compare with the book&apos;s solution.</p>
            )}

            {/* Tools and actions */}
            <div className="mt-10 flex flex-col gap-5 border-t border-slate-100 pt-6 dark:border-white/10 md:flex-row md:items-center md:justify-between">
              <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
                {mode === 'student' ? (
                  <>
                    <button type="button" onClick={getHint} disabled={hintLoading || done} className="flex items-center gap-2 text-xs font-black uppercase tracking-widest text-indigo-600 hover:text-indigo-700 disabled:opacity-30 dark:text-brand">
                      {hintLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Zap className="h-4 w-4" />} Hint
                    </button>
                    <button type="button" onClick={() => studentAction('/api/student/mistakes/notebook', { questionId: q.id }, 'Pinned to My Mistakes', 'Could not pin this question')} className="flex items-center gap-2 text-xs font-black uppercase tracking-widest text-slate-500 hover:text-amber-600 dark:text-slate-400">
                      <Pin className="h-4 w-4" /> Save for later
                    </button>
                    <button type="button" onClick={() => studentAction('/api/student/bookmarks/quick', { questionId: q.id }, 'Bookmarked', 'Could not bookmark this question')} className="flex items-center gap-2 text-xs font-black uppercase tracking-widest text-slate-500 hover:text-indigo-600 dark:text-slate-400">
                      <Bookmark className="h-4 w-4" /> Bookmark
                    </button>
                    <button type="button" onClick={() => setReporting({ reason: '', busy: false })} className="flex items-center gap-2 text-xs font-black uppercase tracking-widest text-slate-500 hover:text-rose-600 dark:text-slate-400">
                      <AlertTriangle className="h-4 w-4" /> Report
                    </button>
                  </>
                ) : props.renderTeacherTools?.(q)}
              </div>

              <div className="flex items-center gap-3">
                {mode === 'student' && !done && kind !== 'written' && (
                  <>
                    <button type="button" onClick={skip} className="flex items-center gap-2 rounded-2xl border-2 border-slate-200 px-5 py-3 text-xs font-black uppercase tracking-widest text-slate-500 hover:border-slate-300 hover:text-slate-800 dark:border-white/10 dark:text-slate-400 dark:hover:text-white">
                      <SkipForward className="h-4 w-4" /> Skip
                    </button>
                    <button type="button" data-testid="submit-answer" onClick={verify} disabled={!state.selected.trim() || state.busy} className="flex items-center gap-2 rounded-2xl bg-slate-900 px-7 py-3 text-xs font-black uppercase tracking-widest text-white hover:bg-slate-800 disabled:opacity-30 dark:bg-white/10 dark:hover:bg-white/20">
                      {state.busy && <Loader2 className="h-4 w-4 animate-spin" />} Check answer
                    </button>
                  </>
                )}
                {mode === 'student' && !done && kind === 'written' && (
                  <button type="button" data-testid="show-solution" onClick={reveal} disabled={state.busy} className="flex items-center gap-2 rounded-2xl bg-slate-900 px-7 py-3 text-xs font-black uppercase tracking-widest text-white hover:bg-slate-800 disabled:opacity-30 dark:bg-white/10 dark:hover:bg-white/20">
                    {state.busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Eye className="h-4 w-4" />} Show solution
                  </button>
                )}
                {done && (
                  <>
                    <button type="button" onClick={() => go(-1)} disabled={index === 0} aria-label="Previous question" className="flex h-12 w-12 items-center justify-center rounded-2xl border-2 border-slate-200 text-slate-600 hover:border-slate-300 disabled:opacity-30 dark:border-white/10 dark:text-slate-300"><ChevronLeft className="h-5 w-5" /></button>
                    <button type="button" data-testid="next-question" onClick={() => go(1)} disabled={index === questions.length - 1} className="flex items-center gap-2 rounded-2xl bg-gradient-to-br from-indigo-600 to-violet-600 px-7 py-3 text-xs font-black uppercase tracking-widest text-white hover:brightness-105 disabled:opacity-30 dark:from-brand dark:to-brand-violet">
                      Next <ArrowRight className="h-4 w-4" />
                    </button>
                  </>
                )}
              </div>
            </div>
          </article>

          {hint?.id === q.id && (
            <div className="rounded-3xl border border-amber-200 bg-amber-50 p-6 dark:border-accent-warm/20 dark:bg-accent-warm/10">
              <p className="mb-2 flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.2em] text-amber-600 dark:text-accent-warm"><MessageSquareQuote className="h-4 w-4" /> Doubt Buddy hint</p>
              <div className="text-sm font-bold italic leading-relaxed text-amber-900 dark:text-amber-100"><MathRenderer content={hint.text} /></div>
            </div>
          )}

          {/* Solution, straight below the question */}
          {done && solution && (
            <section data-testid={`smartbook-solution-${q.id}`} aria-label="Solution" className={`rounded-3xl border p-6 md:p-8 ${state.verdict === true ? 'border-emerald-100 bg-emerald-50 dark:border-emerald-500/20 dark:bg-emerald-500/10' : state.verdict === false ? 'border-rose-100 bg-rose-50 dark:border-rose-500/20 dark:bg-rose-500/10' : 'border-slate-200 bg-white dark:border-white/10 dark:bg-surface'}`}>
              <div className="flex gap-4">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white shadow-sm dark:bg-surface">
                  {state.verdict === true ? <CheckCircle2 className="h-6 w-6 text-emerald-500" /> : state.verdict === false ? <XCircle className="h-6 w-6 text-rose-500" /> : <Eye className="h-6 w-6 text-slate-400" />}
                </div>
                <div className="min-w-0 flex-1 space-y-3">
                  <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400">{state.verdict === true ? 'Correct' : state.verdict === false ? 'Not quite' : 'Solution'}</p>
                  {solution.correctAnswer && (
                    <div className="flex flex-wrap items-baseline gap-1.5 text-sm font-black text-slate-900 dark:text-white"><span>Answer:</span> <span className="font-bold"><MathRenderer content={kind === 'choice' && options[LETTERS.indexOf(answerLetter)] ? `(${answerLetter}) ${options[LETTERS.indexOf(answerLetter)]}` : solution.correctAnswer} /></span></div>
                  )}
                  {solution.explanation ? (
                    <div className="text-sm font-medium leading-relaxed text-slate-800 dark:text-slate-200"><MathRenderer content={solution.explanation} /></div>
                  ) : (
                    <p className="text-sm text-slate-500">No worked solution for this question yet.</p>
                  )}
                </div>
              </div>
            </section>
          )}

          {/* Other exercises */}
          <nav aria-label="Other exercises" className="flex flex-wrap justify-between gap-3 pt-2">
            {props.previous ? <Link href={props.previous.href} className="inline-flex items-center gap-2 text-sm font-bold text-indigo-700 dark:text-brand"><ArrowLeft className="h-4 w-4" />{props.previous.label}</Link> : <span />}
            {props.next && <Link href={props.next.href} className="inline-flex items-center gap-2 text-sm font-bold text-indigo-700 dark:text-brand">{props.next.label}<ArrowRight className="h-4 w-4" /></Link>}
          </nav>
        </div>

        {/* The printed page, on request */}
        {showPage && (
          <aside aria-label="Book page" className="lg:sticky lg:top-36 lg:self-start">
            <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-white/10 dark:bg-surface">
              <div className="flex items-center justify-between border-b border-slate-100 px-3 py-2 dark:border-white/10">
                <button type="button" onClick={() => pageIndex > 0 && setPageAt(props.pages[pageIndex - 1])} disabled={pageIndex <= 0} aria-label="Previous page" className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 disabled:opacity-30 dark:hover:bg-white/5"><ChevronLeft className="h-4 w-4" /></button>
                <span className="text-xs font-black tabular-nums text-slate-600 dark:text-slate-300">Page {pageAt ?? '–'}</span>
                <div className="flex items-center gap-1">
                  <button type="button" onClick={() => pageIndex >= 0 && pageIndex < props.pages.length - 1 && setPageAt(props.pages[pageIndex + 1])} disabled={pageIndex < 0 || pageIndex >= props.pages.length - 1} aria-label="Next page" className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 disabled:opacity-30 dark:hover:bg-white/5"><ChevronRight className="h-4 w-4" /></button>
                  <button type="button" onClick={() => setShowPage(false)} aria-label="Hide page" className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 dark:hover:bg-white/5"><X className="h-4 w-4" /></button>
                </div>
              </div>
              {pageAt != null ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={props.pageImageUrl(pageAt)} alt={`Page ${pageAt}`} className="block w-full" />
              ) : <p className="p-6 text-sm text-slate-500">No printed page recorded for this exercise.</p>}
            </div>
          </aside>
        )}
      </div>

      {reporting && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-sm" onClick={() => !reporting.busy && setReporting(null)}>
          <div role="dialog" aria-labelledby="report-title" onClick={(e) => e.stopPropagation()} className="w-full max-w-md rounded-3xl bg-white p-8 shadow-2xl dark:bg-surface">
            <h2 id="report-title" className="mb-2 flex items-center gap-2 font-display text-xl font-black text-slate-900 dark:text-white"><AlertTriangle className="h-6 w-6 text-rose-500" /> Report this question</h2>
            <p className="mb-4 text-sm text-slate-500 dark:text-slate-400">What is wrong with it? An admin will review it and you will be told the outcome.</p>
            <textarea autoFocus rows={4} value={reporting.reason} onChange={(e) => setReporting({ ...reporting, reason: e.target.value })} className="mb-4 w-full resize-none rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-rose-400 dark:border-white/10 dark:bg-white/5 dark:text-white" />
            <div className="flex gap-3">
              <button type="button" onClick={() => setReporting(null)} disabled={reporting.busy} className="flex-1 rounded-2xl py-3 text-sm font-black text-slate-500 hover:bg-slate-50 dark:hover:bg-white/5">Cancel</button>
              <button type="button" disabled={reporting.busy || !reporting.reason.trim()} onClick={async () => {
                setReporting({ ...reporting, busy: true });
                const ok = await studentAction(`/api/student/questions/${q.id}/flag`, { reason: reporting.reason.trim() }, 'Reported. An admin will review it.', 'Could not report this question');
                setReporting(ok ? null : { ...reporting, busy: false });
              }} className="flex flex-1 items-center justify-center gap-2 rounded-2xl bg-rose-600 py-3 text-sm font-black text-white hover:bg-rose-700 disabled:opacity-40">Submit report</button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
