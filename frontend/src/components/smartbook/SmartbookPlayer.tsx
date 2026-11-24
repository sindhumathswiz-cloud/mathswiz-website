'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { AlertTriangle, ArrowLeft, ArrowRight, Bookmark, BookOpen, CheckCircle2, ChevronLeft, ChevronRight, Columns2, Eye, LayoutList, ListChecks, Loader2, LocateFixed, Maximize2, MessageSquareQuote, Minimize2, Minus, PenLine, Pin, Plus, SkipForward, X, XCircle, Zap } from 'lucide-react';
import toast from 'react-hot-toast';
import MathRenderer from '@/components/MathRenderer';
import QuestionFigures from '@/components/QuestionFigures';
import { parseQuestionOptions } from '@/lib/arena-answer';
import Whiteboard from './Whiteboard';

/**
 * A book exercise, one question at a time. Two ways to read it:
 *  - Reader view (the default): the book on the left half, its printed pages one below another as in a PDF reader,
 *    opening at the exercise and reading on through the chapter; a blank whiteboard on the right half to write and
 *    work on, with the exercise's questions in a tab beside it. Picking a question scrolls the book to its page.
 *  - Practice view: the question and its options in the Practice window's style, the printed page in a panel on
 *    request.
 * Either way the answer is checked on the server and the worked solution follows it; Previous/Next and a palette move
 * around. Students get Practice's own tools (hint, save for later, bookmark, report); teachers see the answer and
 * solution at once and get their own tools (renderTeacherTools).
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

export type PlayerView = 'reader' | 'practice';

export interface SmartbookPlayerProps {
  mode: 'student' | 'teacher';
  /** Where "back" goes and what it says. */
  backHref: string;
  backLabel: string;
  eyebrow: string;
  title: string;
  /** The exercise's own pages. */
  pages: number[];
  /** The pages the reader scrolls through: the exercise's chapter. Defaults to the exercise's pages. */
  readerPages?: number[];
  pageImageUrl: (page: number) => string;
  questions: PlayerQuestion[];
  /** Key under which the current question is remembered on this device. */
  storageKey: string;
  previous?: { href: string; label: string } | null;
  next?: { href: string; label: string } | null;
  renderTeacherTools?: (question: PlayerQuestion) => ReactNode;
  /** The view to open in when this device has not chosen one. */
  defaultView?: PlayerView;
}

const LETTERS = ['A', 'B', 'C', 'D', 'E', 'F'];
const empty: QuestionState = { selected: '', verdict: null, solution: null, busy: false };
const VIEW_KEY = 'smartbook:view';
const ZOOMS = [0.5, 0.75, 1, 1.25, 1.5, 2];

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
  const [view, setView] = useState<PlayerView>(props.defaultView ?? 'reader');
  const [showPage, setShowPage] = useState(false);
  const [pageAt, setPageAt] = useState<number | null>(null);
  const [hint, setHint] = useState<{ id: string; text: string } | null>(null);
  const [hintLoading, setHintLoading] = useState(false);
  const [reporting, setReporting] = useState<{ reason: string; busy: boolean } | null>(null);
  const [startedAt, setStartedAt] = useState(() => Date.now());
  // Reader view.
  const [zoom, setZoom] = useState(1);
  const [rightTab, setRightTab] = useState<'board' | 'questions'>('board');
  const [visiblePage, setVisiblePage] = useState<number | null>(null);
  const [pageRatio, setPageRatio] = useState<number | null>(null);
  const [fullscreen, setFullscreen] = useState(false);
  const viewerRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => { setIndex(readIndex(props.storageKey, questions.length)); }, [props.storageKey, questions.length]);
  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(VIEW_KEY);
      if (saved === 'reader' || saved === 'practice') setView(saved);
    } catch { /* the default view: fine */ }
  }, []);
  useEffect(() => {
    try { window.localStorage.setItem(props.storageKey, String(index)); } catch { /* not remembered: fine */ }
    setStartedAt(Date.now());
    setHint(null);
    setPageAt(questions[index]?.sourcePageStart ?? props.pages[0] ?? null);
  }, [index, props.storageKey, props.pages, questions]);

  const chooseView = (next: PlayerView) => {
    setView(next);
    try { window.localStorage.setItem(VIEW_KEY, next); } catch { /* not remembered: fine */ }
  };

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

  // ---- reader view: the book scrolls like a PDF ----
  const readerPages = props.readerPages?.length ? props.readerPages : props.pages;
  const target = questions[index]?.sourcePageStart ?? props.pages[0] ?? readerPages[0] ?? null;
  const scrollToPage = (page: number | null, smooth = false) => {
    if (page == null) return;
    const el = scrollRef.current?.querySelector<HTMLElement>(`[data-page="${page}"]`);
    el?.scrollIntoView?.({ block: 'start', behavior: smooth ? 'smooth' : 'auto' });
    setVisiblePage(page);
  };
  // Open at the question's page, and go to it whenever another question is picked. Again once the pages' shape is
  // known, as pages above it that had not loaded yet change the height in between.
  useEffect(() => {
    if (view === 'reader') scrollToPage(target, false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, index, pageRatio]);
  const onBookScroll = () => {
    const box = scrollRef.current;
    if (!box) return;
    const top = box.getBoundingClientRect().top + 48;
    for (const el of box.querySelectorAll<HTMLElement>('[data-page]')) {
      if (el.getBoundingClientRect().bottom > top) { setVisiblePage(Number(el.dataset.page)); return; }
    }
  };

  useEffect(() => {
    const onChange = () => setFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, []);
  const toggleFullscreen = () => {
    if (document.fullscreenElement) void document.exitFullscreen?.();
    else void viewerRef.current?.requestFullscreen?.().catch(() => toast.error('Full screen is not available here.'));
  };

  if (!q) {
    return <main className="min-h-screen bg-slate-50 p-10 text-center text-slate-500 dark:bg-background">This exercise has no questions to show yet.</main>;
  }

  const done = mode === 'teacher' || state.verdict != null || state.solution != null;
  const answerLetter = solution?.correctAnswer?.trim() ?? '';
  const pageIndex = pageAt != null ? props.pages.indexOf(pageAt) : -1;

  const palette = (compact: boolean) => (
    <nav aria-label="Questions" className={compact ? 'overflow-x-auto' : 'mx-auto max-w-6xl overflow-x-auto px-4 pb-3 md:px-6'}>
      <ol className={`flex gap-1.5 ${compact ? 'pb-1' : ''}`}>
        {questions.map((item, i) => {
          const s = states[item.id];
          const tone = s?.verdict === true ? 'bg-emerald-500 text-white border-emerald-500' : s?.verdict === false ? 'bg-rose-500 text-white border-rose-500' : s?.solution ? 'bg-slate-300 text-slate-800 border-slate-300 dark:bg-white/20 dark:text-white' : 'bg-white text-slate-600 border-slate-200 dark:bg-white/5 dark:text-slate-300 dark:border-white/10';
          return (
            <li key={item.id}>
              <button type="button" onClick={() => setIndex(i)} aria-current={i === index ? 'step' : undefined} aria-label={`Question ${item.printedNumber || i + 1}`} className={`${compact ? 'h-7 min-w-7 rounded-md px-1.5 text-[11px]' : 'h-8 min-w-8 rounded-lg px-2 text-xs'} border font-black tabular-nums ${tone} ${i === index ? 'ring-2 ring-indigo-500 ring-offset-1 dark:ring-brand dark:ring-offset-background' : ''}`}>
                {item.printedNumber || i + 1}
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );

  // The question, its options or answer box, and its tools and actions: the same in both views, tighter in the
  // floating window.
  const questionMain = (compact: boolean) => (
    <>
      <div className={`flex flex-wrap items-center gap-2 ${compact ? 'mb-3' : 'mb-6'}`}>
        <span className="rounded-full bg-indigo-50 px-3 py-1 text-[10px] font-black uppercase tracking-widest text-indigo-700 dark:bg-brand/10 dark:text-brand">Question {q.printedNumber || index + 1} · {index + 1} of {questions.length}</span>
        {q.sourcePageStart != null && (
          compact
            ? <button type="button" onClick={() => scrollToPage(q.sourcePageStart, true)} className="rounded-full bg-slate-100 px-3 py-1 text-[10px] font-black uppercase tracking-widest text-slate-500 hover:text-indigo-700 dark:bg-white/5 dark:text-slate-400">Page {q.sourcePageStart}</button>
            : <span className="rounded-full bg-slate-100 px-3 py-1 text-[10px] font-black uppercase tracking-widest text-slate-500 dark:bg-white/5 dark:text-slate-400">Page {q.sourcePageStart}</span>
        )}
      </div>
      <div className={`${compact ? 'mb-4 text-base' : 'mb-8 text-lg md:text-xl'} font-bold leading-relaxed text-slate-900 dark:text-white`}><MathRenderer content={q.content} /><QuestionFigures questionId={q.id} /></div>

      {kind === 'choice' && (
        <div className={`grid grid-cols-1 ${compact ? 'gap-2' : 'gap-3'}`} role="radiogroup" aria-label="Options">
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
                className={`group flex items-center ${compact ? 'gap-3 rounded-xl p-2.5' : 'gap-5 rounded-2xl p-4'} border-2 text-left transition-all ${isAnswer ? 'border-emerald-500 bg-emerald-50/50 dark:border-emerald-500/60 dark:bg-emerald-500/10' : isWrongPick ? 'border-rose-500 bg-rose-50/50 dark:border-rose-500/60 dark:bg-rose-500/10' : picked ? 'border-indigo-600 bg-indigo-50/30 dark:border-brand dark:bg-brand/10' : 'border-slate-100 hover:border-indigo-300 hover:bg-slate-50/50 dark:border-white/10 dark:hover:border-brand/40 dark:hover:bg-white/5'}`}
              >
                <span className={`flex ${compact ? 'h-8 w-8 rounded-lg' : 'h-10 w-10 rounded-xl'} shrink-0 items-center justify-center border-2 text-sm font-black ${isAnswer ? 'border-emerald-500 bg-emerald-500 text-white' : isWrongPick ? 'border-rose-500 bg-rose-500 text-white' : picked ? 'border-indigo-600 bg-indigo-600 text-white dark:border-brand dark:bg-brand' : 'border-slate-200 bg-white text-slate-400 dark:border-white/10 dark:bg-white/5 dark:text-slate-500'}`}>{letter}</span>
                <span className={`min-w-0 flex-1 ${compact ? 'text-sm' : 'text-base'} font-bold text-slate-700 dark:text-slate-300`}><MathRenderer content={opt} /></span>
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
      <div className={`${compact ? 'mt-5 flex-col gap-3 pt-4' : 'mt-10 flex-col gap-5 pt-6 md:flex-row md:items-center md:justify-between'} flex border-t border-slate-100 dark:border-white/10`}>
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

        <div className={`flex flex-wrap items-center gap-3 ${compact ? 'justify-end' : ''}`}>
          {mode === 'student' && !done && kind !== 'written' && (
            <>
              <button type="button" onClick={skip} className={`flex items-center gap-2 rounded-2xl border-2 border-slate-200 ${compact ? 'px-4 py-2' : 'px-5 py-3'} text-xs font-black uppercase tracking-widest text-slate-500 hover:border-slate-300 hover:text-slate-800 dark:border-white/10 dark:text-slate-400 dark:hover:text-white`}>
                <SkipForward className="h-4 w-4" /> Skip
              </button>
              <button type="button" data-testid="submit-answer" onClick={verify} disabled={!state.selected.trim() || state.busy} className={`flex items-center gap-2 rounded-2xl bg-slate-900 ${compact ? 'px-5 py-2' : 'px-7 py-3'} text-xs font-black uppercase tracking-widest text-white hover:bg-slate-800 disabled:opacity-30 dark:bg-white/10 dark:hover:bg-white/20`}>
                {state.busy && <Loader2 className="h-4 w-4 animate-spin" />} Check answer
              </button>
            </>
          )}
          {mode === 'student' && !done && kind === 'written' && (
            <button type="button" data-testid="show-solution" onClick={reveal} disabled={state.busy} className={`flex items-center gap-2 rounded-2xl bg-slate-900 ${compact ? 'px-5 py-2' : 'px-7 py-3'} text-xs font-black uppercase tracking-widest text-white hover:bg-slate-800 disabled:opacity-30 dark:bg-white/10 dark:hover:bg-white/20`}>
              {state.busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Eye className="h-4 w-4" />} Show solution
            </button>
          )}
          {done && (
            <>
              <button type="button" onClick={() => go(-1)} disabled={index === 0} aria-label="Previous question" className={`flex ${compact ? 'h-10 w-10' : 'h-12 w-12'} items-center justify-center rounded-2xl border-2 border-slate-200 text-slate-600 hover:border-slate-300 disabled:opacity-30 dark:border-white/10 dark:text-slate-300`}><ChevronLeft className="h-5 w-5" /></button>
              <button type="button" data-testid="next-question" onClick={() => go(1)} disabled={index === questions.length - 1} className={`flex items-center gap-2 rounded-2xl bg-gradient-to-br from-indigo-600 to-violet-600 ${compact ? 'px-5 py-2.5' : 'px-7 py-3'} text-xs font-black uppercase tracking-widest text-white hover:brightness-105 disabled:opacity-30 dark:from-brand dark:to-brand-violet`}>
                Next <ArrowRight className="h-4 w-4" />
              </button>
            </>
          )}
        </div>
      </div>
    </>
  );

  // Doubt Buddy's hint and the solution, under the question.
  const afterQuestion = (compact: boolean) => (
    <>
      {hint?.id === q.id && (
        <div className={`${compact ? 'mt-4 rounded-2xl p-4' : 'rounded-3xl p-6'} border border-amber-200 bg-amber-50 dark:border-accent-warm/20 dark:bg-accent-warm/10`}>
          <p className="mb-2 flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.2em] text-amber-600 dark:text-accent-warm"><MessageSquareQuote className="h-4 w-4" /> Doubt Buddy hint</p>
          <div className="text-sm font-bold italic leading-relaxed text-amber-900 dark:text-amber-100"><MathRenderer content={hint.text} /></div>
        </div>
      )}
      {done && solution && (
        <section data-testid={`smartbook-solution-${q.id}`} aria-label="Solution" className={`${compact ? 'mt-4 rounded-2xl p-4' : 'rounded-3xl p-6 md:p-8'} border ${state.verdict === true ? 'border-emerald-100 bg-emerald-50 dark:border-emerald-500/20 dark:bg-emerald-500/10' : state.verdict === false ? 'border-rose-100 bg-rose-50 dark:border-rose-500/20 dark:bg-rose-500/10' : 'border-slate-200 bg-white dark:border-white/10 dark:bg-surface'}`}>
          <div className={`flex ${compact ? 'gap-3' : 'gap-4'}`}>
            <div className={`flex ${compact ? 'h-8 w-8' : 'h-10 w-10'} shrink-0 items-center justify-center rounded-xl bg-white shadow-sm dark:bg-surface`}>
              {state.verdict === true ? <CheckCircle2 className="h-5 w-5 text-emerald-500" /> : state.verdict === false ? <XCircle className="h-5 w-5 text-rose-500" /> : <Eye className="h-5 w-5 text-slate-400" />}
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
    </>
  );

  const viewSwitch = (
    <div role="group" aria-label="View" className="flex rounded-xl border border-slate-200 p-0.5 dark:border-white/10">
      {([['reader', 'Reader view', Columns2], ['practice', 'Practice view', LayoutList]] as const).map(([value, label, Icon]) => (
        <button key={value} type="button" aria-pressed={view === value} data-testid={`view-${value}`} onClick={() => chooseView(value)}
          className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-black ${view === value ? 'bg-slate-900 text-white dark:bg-white/15' : 'text-slate-600 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-white/5'}`}>
          <Icon className="h-3.5 w-3.5" /> <span className="hidden sm:inline">{label}</span>
        </button>
      ))}
    </div>
  );

  const topBar = (
    <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-3 md:px-6">
      <div className="min-w-0">
        <Link href={props.backHref} className="inline-flex items-center gap-1.5 text-xs font-bold text-indigo-700 dark:text-brand"><ArrowLeft className="h-3.5 w-3.5" />{props.backLabel}</Link>
        <p className="truncate text-[10px] font-black uppercase tracking-widest text-slate-400 dark:text-slate-500">{props.eyebrow}</p>
        <h1 className="truncate font-display text-lg font-black text-slate-900 dark:text-white">{props.title}</h1>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        {mode === 'student' && (
          <p role="status" data-testid="smartbook-progress" className="rounded-full bg-indigo-50 px-3 py-1.5 text-xs font-black tabular-nums text-indigo-800 dark:bg-brand/10 dark:text-brand">{answered} answered · {right} right</p>
        )}
        {view === 'practice' && (
          <button type="button" onClick={() => setShowPage((v) => !v)} aria-pressed={showPage} data-testid="toggle-page" className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-xs font-black uppercase tracking-widest text-slate-700 hover:bg-slate-50 dark:border-white/10 dark:text-slate-200 dark:hover:bg-white/5">
            <BookOpen className="h-4 w-4" /> {showPage ? 'Hide page' : 'Show page'}
          </button>
        )}
        {viewSwitch}
      </div>
    </div>
  );

  const exerciseNav = (
    <nav aria-label="Other exercises" className="flex flex-wrap justify-between gap-3 pt-2">
      {props.previous ? <Link href={props.previous.href} className="inline-flex items-center gap-2 text-sm font-bold text-indigo-700 dark:text-brand"><ArrowLeft className="h-4 w-4" />{props.previous.label}</Link> : <span />}
      {props.next && <Link href={props.next.href} className="inline-flex items-center gap-2 text-sm font-bold text-indigo-700 dark:text-brand">{props.next.label}<ArrowRight className="h-4 w-4" /></Link>}
    </nav>
  );

  const reportDialog = reporting && (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-sm" onClick={() => !reporting.busy && setReporting(null)}>
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
  );

  // ---------------- reader view ----------------
  if (view === 'reader') {
    const first = readerPages[0];
    const last = readerPages[readerPages.length - 1];
    const zoomBtn = 'inline-flex h-8 w-8 items-center justify-center rounded-lg hover:bg-white/10 disabled:opacity-30';
    return (
      // One screen high: the two halves fill what the top bar leaves and scroll on their own.
      <main className="flex h-full flex-col bg-[#F8FAFC] dark:bg-background">
        <div className="z-30 shrink-0 border-b border-slate-200 bg-white/95 backdrop-blur dark:border-white/10 dark:bg-surface/95">{topBar}</div>

        <div ref={viewerRef} data-testid="reader" className="grid min-h-0 flex-1 grid-rows-2 bg-slate-100 dark:bg-background md:grid-cols-2 md:grid-rows-1">
          {/* Left: the book, page by page */}
          <section aria-label="Book" className="flex min-h-0 flex-col bg-slate-600 dark:bg-slate-900">
            <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 bg-slate-800 px-3 py-1.5 text-xs text-slate-200">
              <span data-testid="reader-page" className="font-black tabular-nums text-white">Page {visiblePage ?? target ?? '–'}{first != null ? <span className="font-bold text-slate-400"> · pp. {first}–{last}</span> : null}</span>
              <div className="flex items-center gap-0.5">
                <button type="button" onClick={() => scrollToPage(target, true)} className="mr-1 inline-flex items-center gap-1 rounded-lg px-2 py-1.5 font-bold hover:bg-white/10" title="Back to this question's page"><LocateFixed className="h-3.5 w-3.5" /> Question&apos;s page</button>
                <button type="button" onClick={() => setZoom((z) => ZOOMS[Math.max(0, ZOOMS.indexOf(z) - 1)] ?? z)} disabled={zoom === ZOOMS[0]} aria-label="Zoom out" className={zoomBtn}><Minus className="h-4 w-4" /></button>
                <span className="w-10 text-center font-black tabular-nums">{Math.round(zoom * 100)}%</span>
                <button type="button" onClick={() => setZoom((z) => ZOOMS[Math.min(ZOOMS.length - 1, ZOOMS.indexOf(z) + 1)] ?? z)} disabled={zoom === ZOOMS[ZOOMS.length - 1]} aria-label="Zoom in" className={zoomBtn}><Plus className="h-4 w-4" /></button>
                <button type="button" onClick={toggleFullscreen} aria-label={fullscreen ? 'Leave full screen' : 'Full screen'} className={zoomBtn}>{fullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}</button>
              </div>
            </div>
            <div ref={scrollRef} onScroll={onBookScroll} data-testid="reader-pages" className="min-h-0 flex-1 overflow-auto px-3 py-4">
              {readerPages.length ? (
                <div className="mx-auto space-y-4" style={{ width: `${zoom * 100}%` }}>
                  {readerPages.map((page) => (
                    <figure key={page} data-page={page} className="scroll-mt-2">
                      <div className={`relative bg-white shadow-xl ${page === q.sourcePageStart ? 'ring-4 ring-indigo-400' : ''}`} style={pageRatio ? { aspectRatio: String(1 / pageRatio) } : { aspectRatio: '0.74' }}>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={props.pageImageUrl(page)}
                          alt={`Page ${page}`}
                          loading={Math.abs(readerPages.indexOf(page) - readerPages.indexOf(target ?? first)) <= 2 ? 'eager' : 'lazy'}
                          onLoad={(e) => { const img = e.currentTarget; if (!pageRatio && img.naturalWidth) setPageRatio(img.naturalHeight / img.naturalWidth); }}
                          className="block h-full w-full"
                        />
                      </div>
                      <figcaption className="mt-1 text-center text-[11px] font-bold tabular-nums text-slate-300">{page}</figcaption>
                    </figure>
                  ))}
                </div>
              ) : (
                <p className="p-10 text-center text-sm text-slate-300">No printed page is recorded for this exercise.</p>
              )}
            </div>
          </section>

          {/* Right: a blank board to work on, and the exercise's questions */}
          <section aria-label="Work area" className="flex min-h-0 flex-col border-t border-slate-200 bg-white dark:border-white/10 dark:bg-surface md:border-l md:border-t-0">
            <div role="tablist" aria-label="Work area" className="flex shrink-0 gap-1 border-b border-slate-200 bg-slate-50 p-1.5 dark:border-white/10 dark:bg-white/5">
              {([['board', 'Whiteboard', PenLine], ['questions', `Questions (${questions.length})`, ListChecks]] as const).map(([value, label, Icon]) => (
                <button key={value} type="button" role="tab" aria-selected={rightTab === value} data-testid={`tab-${value}`} onClick={() => setRightTab(value)}
                  className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-black ${rightTab === value ? 'bg-white text-slate-900 shadow-sm dark:bg-white/15 dark:text-white' : 'text-slate-600 hover:bg-white/60 dark:text-slate-300 dark:hover:bg-white/5'}`}>
                  <Icon className="h-4 w-4" /> {label}
                </button>
              ))}
            </div>
            {rightTab === 'board' ? (
              <div className="min-h-0 flex-1"><Whiteboard storageKey={`${props.storageKey}:board`} /></div>
            ) : (
              <div className="flex min-h-0 flex-1 flex-col">
                <div className="flex shrink-0 items-center gap-2 border-b border-slate-100 px-3 py-2 dark:border-white/10">
                  <button type="button" onClick={() => go(-1)} disabled={index === 0} aria-label="Previous question" className="rounded-lg p-1.5 text-slate-600 hover:bg-slate-100 disabled:opacity-30 dark:text-slate-300 dark:hover:bg-white/10"><ChevronLeft className="h-4 w-4" /></button>
                  <div className="min-w-0 flex-1">{palette(true)}</div>
                  <button type="button" onClick={() => go(1)} disabled={index === questions.length - 1} aria-label="Next question" className="rounded-lg p-1.5 text-slate-600 hover:bg-slate-100 disabled:opacity-30 dark:text-slate-300 dark:hover:bg-white/10"><ChevronRight className="h-4 w-4" /></button>
                </div>
                <div data-testid={`smartbook-question-${q.id}`} className="min-h-0 flex-1 overflow-y-auto p-4">
                  {questionMain(true)}
                  {afterQuestion(true)}
                  <div className="mt-4 text-xs">{exerciseNav}</div>
                </div>
              </div>
            )}
          </section>
        </div>
        {reportDialog}
      </main>
    );
  }

  // ---------------- practice view ----------------
  return (
    <main className="min-h-screen bg-[#F8FAFC] pb-20 dark:bg-background">
      <div className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 backdrop-blur dark:border-white/10 dark:bg-surface/95">
        {topBar}
        {palette(false)}
      </div>

      <div className={`mx-auto mt-8 grid max-w-6xl gap-6 px-4 md:px-6 ${showPage ? 'lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]' : ''}`}>
        <div className="space-y-6">
          {/* Question card, as in Practice */}
          <article data-testid={`smartbook-question-${q.id}`} className="relative overflow-hidden rounded-[32px] border border-slate-200 bg-white p-6 shadow-sm dark:border-white/10 dark:bg-surface md:p-10">
            {questionMain(false)}
          </article>
          {afterQuestion(false)}
          {exerciseNav}
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

      {reportDialog}
    </main>
  );
}
