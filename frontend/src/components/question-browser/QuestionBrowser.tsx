'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowDown, ArrowUp, BookOpen, Check, ChevronLeft, ChevronRight, ClipboardList, Eye, EyeOff, FilePlus2, Loader2, RotateCcw, Search, Trash2, X } from 'lucide-react';
import MathRenderer from '@/components/MathRenderer';
import QuestionFigures from '@/components/QuestionFigures';
import type { SourceBook } from '@/lib/question-source-filter';

/** Admins and teachers find questions by filters and pick them for a question paper or a practice sheet. */

const TYPE_LABEL: Record<string, string> = {
  SINGLE_CHOICE: 'Single choice', MULTIPLE_CHOICE: 'Multiple choice', INTEGER: 'Numerical', TRUE_FALSE: 'True / false',
  SUBJECTIVE: 'Written', FILL_IN_BLANKS: 'Fill in the blanks', ASSERTION_REASONING: 'Assertion–reason', CASE_STUDY: 'Case study',
  VERY_SHORT_ANSWER: 'Very short answer', SHORT_ANSWER: 'Short answer', LONG_ANSWER: 'Long answer',
};
const DIFFICULTY_LABEL: Record<string, string> = { EASY: 'Easy', MEDIUM: 'Medium', HARD: 'Hard' };
const STATUS_LABEL: Record<string, string> = { APPROVED: 'Approved', PENDING_REVIEW: 'Pending review', DRAFT: 'Draft', REPORTED: 'Reported', ALL: 'Any status' };

type Facet = { value: string; count: number };
type BrowserQuestion = {
  id: string; content: string; options: unknown; correctAnswer: string | null; explanation: string | null;
  type: string; difficulty: string; class: string | null; topic: string | null; status: string; verificationStatus: string;
  printedNumber: string | null; sourcePageStart: number | null; mine: boolean;
  book: { title: string; className: string } | null; bookChapter: { name: string; chapterNumber: string | null } | null;
};
type Picked = { id: string; preview: string; content?: string; type: string; source: string };
type Filters = {
  q: string; class: string; bookId: string; bookChapterId: string; bookExerciseId: string; topic: string;
  types: string[]; difficulties: string[]; solution: string; status: string; mine: boolean; sort: 'book' | 'newest';
};

const EMPTY: Filters = { q: '', class: '', bookId: '', bookChapterId: '', bookExerciseId: '', topic: '', types: [], difficulties: [], solution: '', status: 'APPROVED', mine: false, sort: 'book' };

const toParams = (f: Filters, page: number, pageSize: number) => {
  const p = new URLSearchParams();
  if (f.q.trim()) p.set('q', f.q.trim());
  if (f.class) p.set('class', f.class);
  if (f.bookId) p.set('bookId', f.bookId);
  if (f.bookChapterId) p.set('bookChapterId', f.bookChapterId);
  if (f.bookExerciseId) p.set('bookExerciseId', f.bookExerciseId);
  if (f.topic) p.set('topic', f.topic);
  if (f.types.length) p.set('types', f.types.join(','));
  if (f.difficulties.length) p.set('difficulties', f.difficulties.join(','));
  if (f.solution) p.set('solution', f.solution);
  if (f.status !== 'APPROVED') p.set('status', f.status);
  if (f.mine) p.set('mine', '1');
  if (f.sort !== 'book') p.set('sort', f.sort);
  if (page > 1) p.set('page', String(page));
  if (pageSize !== 25) p.set('pageSize', String(pageSize));
  return p;
};
const fromParams = (p: URLSearchParams): { filters: Filters; page: number; pageSize: number } => ({
  filters: {
    q: p.get('q') ?? '', class: p.get('class') ?? '', bookId: p.get('bookId') ?? '', bookChapterId: p.get('bookChapterId') ?? '',
    bookExerciseId: p.get('bookExerciseId') ?? '', topic: p.get('topic') ?? '',
    types: (p.get('types') ?? '').split(',').filter(Boolean), difficulties: (p.get('difficulties') ?? '').split(',').filter(Boolean),
    solution: p.get('solution') ?? '', status: p.get('status') ?? 'APPROVED', mine: p.get('mine') === '1', sort: p.get('sort') === 'newest' ? 'newest' : 'book',
  },
  page: Math.max(1, Number.parseInt(p.get('page') ?? '1', 10) || 1),
  pageSize: [25, 50, 100].includes(Number(p.get('pageSize'))) ? Number(p.get('pageSize')) : 25,
});

const plain = (s: string, n = 110) => {
  const t = s.replace(/\$+/g, '').replace(/\\[a-zA-Z]+/g, ' ').replace(/[{}]/g, '').replace(/\s+/g, ' ').trim();
  return t.length > n ? `${t.slice(0, n - 1)}…` : t;
};
const sourceOf = (q: BrowserQuestion) => [
  q.book?.title,
  q.bookChapter ? `${q.bookChapter.chapterNumber ? `Ch ${q.bookChapter.chapterNumber} ` : ''}${q.bookChapter.name}` : null,
  q.sourcePageStart ? `p. ${q.sourcePageStart}` : null,
  q.printedNumber ? `Q ${q.printedNumber.replace(/^Q\.?\s*/i, '')}` : null,
].filter(Boolean).join(' · ');

const chip = (on: boolean) => `inline-flex items-center gap-1 rounded-lg border px-2.5 py-1 text-xs font-bold transition-colors ${on
  ? 'border-indigo-600 bg-indigo-600 text-white dark:border-brand dark:bg-brand'
  : 'border-slate-200 bg-white text-slate-700 hover:border-indigo-300 dark:border-white/10 dark:bg-surface dark:text-slate-300'}`;
const selectCls = 'w-full rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-sm text-slate-800 dark:border-white/10 dark:bg-surface dark:text-slate-200';
const labelCls = 'mb-1 block text-[10px] font-black uppercase tracking-widest text-slate-400 dark:text-slate-500';

export default function QuestionBrowser({ role, books }: { role: 'ADMIN' | 'TEACHER'; books: SourceBook[] }) {
  const isAdmin = role === 'ADMIN';
  const storageKey = `question-browser-selection:${role}`;
  const [filters, setFilters] = useState<Filters>(EMPTY);
  const [searchText, setSearchText] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [ready, setReady] = useState(false);
  const [questions, setQuestions] = useState<BrowserQuestion[]>([]);
  const [total, setTotal] = useState(0);
  const [facets, setFacets] = useState<{ types: Facet[]; difficulties: Facet[]; topics: Facet[] } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [shown, setShown] = useState<Set<string>>(new Set());
  const [picked, setPicked] = useState<Picked[]>([]);
  const [trayOpen, setTrayOpen] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const request = useRef(0);

  // Filters come from the address (so a reload or a shared link keeps them); the selection from this browser.
  useEffect(() => {
    const initial = fromParams(new URLSearchParams(window.location.search));
    setFilters(initial.filters);
    setSearchText(initial.filters.q);
    setPage(initial.page);
    setPageSize(initial.pageSize);
    try {
      const saved = JSON.parse(window.localStorage.getItem(storageKey) ?? '[]');
      if (Array.isArray(saved)) setPicked(saved.filter((p) => p && typeof p.id === 'string'));
    } catch { /* storage unavailable */ }
    setReady(true);
  }, [storageKey]);
  useEffect(() => {
    if (!ready) return;
    try { window.localStorage.setItem(storageKey, JSON.stringify(picked)); } catch { /* storage unavailable */ }
  }, [picked, ready, storageKey]);

  // Typing in the search box waits for a pause before searching.
  useEffect(() => {
    if (!ready || searchText === filters.q) return;
    const t = setTimeout(() => { setFilters((f) => ({ ...f, q: searchText })); setPage(1); }, 400);
    return () => clearTimeout(t);
  }, [searchText, filters.q, ready]);

  const load = useCallback(async () => {
    const mine = ++request.current;
    setLoading(true);
    setError(null);
    const params = toParams(filters, page, pageSize);
    window.history.replaceState(null, '', `${window.location.pathname}${params.toString() ? `?${params}` : ''}`);
    params.set('facets', '1');
    try {
      const res = await fetch(`/api/teacher/question-browser?${params}`);
      const data = await res.json();
      if (mine !== request.current) return;
      if (!res.ok) throw new Error(data.error || 'Could not load questions');
      setQuestions(data.questions);
      setTotal(data.total);
      setFacets(data.facets ?? null);
    } catch (e) {
      if (mine === request.current) setError(e instanceof Error ? e.message : 'Could not load questions');
    } finally {
      if (mine === request.current) setLoading(false);
    }
  }, [filters, page, pageSize]);
  useEffect(() => { if (ready) void load(); }, [ready, load]);

  const update = (patch: Partial<Filters>) => { setFilters((f) => ({ ...f, ...patch })); setPage(1); };
  const toggleIn = (key: 'types' | 'difficulties', value: string) =>
    update({ [key]: filters[key].includes(value) ? filters[key].filter((v) => v !== value) : [...filters[key], value] } as Partial<Filters>);

  const book = books.find((b) => b.id === filters.bookId);
  const chapter = book?.chapters.find((c) => c.id === filters.bookChapterId);
  const classes = useMemo(() => [...new Set(['Class 11', 'Class 12', ...books.map((b) => b.className).filter(Boolean)])].sort(), [books]);
  const visibleBooks = filters.class ? books.filter((b) => b.className === filters.class) : books;

  const pickedIds = useMemo(() => new Set(picked.map((p) => p.id)), [picked]);
  const pick = (q: BrowserQuestion) => setPicked((list) => (list.some((p) => p.id === q.id)
    ? list.filter((p) => p.id !== q.id)
    : [...list, { id: q.id, preview: plain(q.content), content: q.content, type: q.type, source: sourceOf(q) }]));
  const allOnPage = questions.length > 0 && questions.every((q) => pickedIds.has(q.id));
  const pickPage = () => setPicked((list) => (allOnPage
    ? list.filter((p) => !questions.some((q) => q.id === p.id))
    : [...list, ...questions.filter((q) => !pickedIds.has(q.id)).map((q) => ({ id: q.id, preview: plain(q.content), content: q.content, type: q.type, source: sourceOf(q) }))]));
  const move = (i: number, by: number) => setPicked((list) => {
    const next = [...list];
    const [item] = next.splice(i, 1);
    next.splice(Math.max(0, Math.min(next.length, i + by)), 0, item);
    return next;
  });

  const pages = Math.max(1, Math.ceil(total / pageSize));
  const filtersActive = JSON.stringify({ ...filters, q: searchText }) !== JSON.stringify(EMPTY);

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
      <header className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-black text-slate-900 dark:text-white">Find questions</h1>
          <p className="mt-1 max-w-2xl text-sm text-slate-500 dark:text-slate-400">
            Narrow the question bank with the filters, tick the questions you want, then put them into a question paper or a practice sheet.
            {isAdmin ? ' Only approved questions can go into a paper.' : ' You see approved questions and your own.'}
          </p>
        </div>
        <Link href={isAdmin ? '/admin/question-bank' : '/teacher/tests'} className="text-sm font-bold text-indigo-600 hover:underline dark:text-brand">
          {isAdmin ? 'Review and edit questions →' : 'My tests →'}
        </Link>
      </header>

      <div className="grid gap-5 lg:grid-cols-[17rem_1fr]">
        {/* ---------------- filters ---------------- */}
        <aside aria-label="Filters" className="space-y-4 self-start rounded-2xl border border-slate-200 bg-white p-4 dark:border-white/10 dark:bg-surface lg:sticky lg:top-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-black text-slate-900 dark:text-white">Filters</h2>
            {filtersActive && (
              <button type="button" onClick={() => { setFilters(EMPTY); setSearchText(''); setPage(1); }} className="inline-flex items-center gap-1 text-xs font-bold text-indigo-600 dark:text-brand">
                <RotateCcw className="h-3.5 w-3.5" /> Clear all
              </button>
            )}
          </div>

          <label className="block">
            <span className={labelCls}>Class</span>
            <select id="qb-class" value={filters.class} onChange={(e) => update({ class: e.target.value, bookId: '', bookChapterId: '', bookExerciseId: '' })} className={selectCls}>
              <option value="">All classes</option>
              {classes.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </label>
          <label className="block">
            <span className={labelCls}>Book</span>
            <select id="qb-book" value={filters.bookId} onChange={(e) => update({ bookId: e.target.value, bookChapterId: '', bookExerciseId: '' })} className={selectCls}>
              <option value="">All books</option>
              {visibleBooks.map((b) => <option key={b.id} value={b.id}>{b.title} ({b.total})</option>)}
            </select>
          </label>
          {book && (
            <label className="block">
              <span className={labelCls}>Chapter</span>
              <select id="qb-chapter" value={filters.bookChapterId} onChange={(e) => update({ bookChapterId: e.target.value, bookExerciseId: '' })} className={selectCls}>
                <option value="">All chapters</option>
                {book.chapters.map((c) => <option key={c.id} value={c.id}>{c.chapterNumber ? `${c.chapterNumber}. ` : ''}{c.name} ({c.total})</option>)}
              </select>
            </label>
          )}
          {chapter && chapter.exercises.length > 0 && (
            <label className="block">
              <span className={labelCls}>Exercise</span>
              <select id="qb-exercise" value={filters.bookExerciseId} onChange={(e) => update({ bookExerciseId: e.target.value })} className={selectCls}>
                <option value="">All exercises</option>
                {chapter.exercises.map((x) => <option key={x.id} value={x.id}>{x.label} ({x.total})</option>)}
              </select>
            </label>
          )}

          <label className="block">
            <span className={labelCls}>Topic</span>
            <select id="qb-topic" value={filters.topic} onChange={(e) => update({ topic: e.target.value })} className={selectCls}>
              <option value="">All topics</option>
              {filters.topic && !facets?.topics.some((t) => t.value === filters.topic) && <option value={filters.topic}>{filters.topic}</option>}
              {(facets?.topics ?? []).map((t) => <option key={t.value} value={t.value}>{t.value} ({t.count})</option>)}
            </select>
          </label>

          <fieldset>
            <legend className={labelCls}>Question type</legend>
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

          <fieldset>
            <legend className={labelCls}>Difficulty</legend>
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

          <label className="block">
            <span className={labelCls}>Worked solution</span>
            <select id="qb-solution" value={filters.solution} onChange={(e) => update({ solution: e.target.value })} className={selectCls}>
              <option value="">With or without</option>
              <option value="with">Has a worked solution</option>
              <option value="without">No worked solution</option>
            </select>
          </label>

          {isAdmin ? (
            <label className="block">
              <span className={labelCls}>Status</span>
              <select id="qb-status" value={filters.status} onChange={(e) => update({ status: e.target.value })} className={selectCls}>
                {['APPROVED', 'PENDING_REVIEW', 'DRAFT', 'REPORTED', 'ALL'].map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
              </select>
            </label>
          ) : (
            <label className="flex items-center gap-2 text-sm font-bold text-slate-700 dark:text-slate-300">
              <input id="qb-mine" type="checkbox" checked={filters.mine} onChange={(e) => update({ mine: e.target.checked })} /> Only questions I wrote
            </label>
          )}
        </aside>

        {/* ---------------- results ---------------- */}
        <section aria-label="Questions" className="min-w-0 pb-28">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <label className="relative min-w-0 flex-1 basis-64">
              <span className="sr-only">Search question text</span>
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                id="qb-search"
                type="search"
                value={searchText}
                onChange={(e) => setSearchText(e.target.value)}
                placeholder="Search the question text, e.g. integral sin cos"
                className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-9 pr-3 text-sm outline-none focus:ring-2 focus:ring-indigo-500 dark:border-white/10 dark:bg-surface dark:text-white"
              />
            </label>
            <select id="qb-sort" aria-label="Order" value={filters.sort} onChange={(e) => update({ sort: e.target.value as Filters['sort'] })} className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm dark:border-white/10 dark:bg-surface dark:text-slate-200">
              <option value="book">Book order</option>
              <option value="newest">Newest first</option>
            </select>
          </div>

          <div className="mb-3 flex flex-wrap items-center justify-between gap-2 text-sm">
            <p data-testid="qb-count" className="font-bold text-slate-600 dark:text-slate-300">
              {loading ? 'Loading…' : total === 0 ? 'No questions match' : `${((page - 1) * pageSize + 1).toLocaleString('en-IN')}–${Math.min(page * pageSize, total).toLocaleString('en-IN')} of ${total.toLocaleString('en-IN')} questions`}
            </p>
            {questions.length > 0 && (
              <button type="button" onClick={pickPage} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 hover:border-indigo-300 dark:border-white/10 dark:bg-surface dark:text-slate-300">
                <Check className="h-3.5 w-3.5" /> {allOnPage ? 'Untick this page' : 'Tick all on this page'}
              </button>
            )}
          </div>

          {error && <p role="alert" className="mb-3 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-bold text-rose-800 dark:border-rose-500/20 dark:bg-rose-500/10 dark:text-rose-300">{error}</p>}

          {!loading && total === 0 && !error && (
            <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center text-sm text-slate-500 dark:border-white/10 dark:bg-surface dark:text-slate-400">
              Nothing matches these filters. Try removing one, or search with fewer words.
            </div>
          )}

          <ol className={`space-y-3 ${loading ? 'opacity-60' : ''}`}>
            {questions.map((q, i) => {
              const isPicked = pickedIds.has(q.id);
              const options = Array.isArray(q.options) ? (q.options as unknown[]).map(String).filter((o) => o.trim()) : [];
              const open = shown.has(q.id);
              return (
                <li key={q.id} data-testid={`qb-question-${q.id}`} className={`rounded-2xl border bg-white p-4 dark:bg-surface ${isPicked ? 'border-indigo-400 ring-1 ring-indigo-400 dark:border-brand dark:ring-brand' : 'border-slate-200 dark:border-white/10'}`}>
                  <div className="flex gap-3">
                    <label className="flex shrink-0 flex-col items-center gap-1 pt-0.5">
                      <input type="checkbox" checked={isPicked} onChange={() => pick(q)} className="h-5 w-5 accent-indigo-600" aria-label={`Select question ${(page - 1) * pageSize + i + 1}`} />
                      <span className="text-[10px] font-black tabular-nums text-slate-400">{(page - 1) * pageSize + i + 1}</span>
                    </label>
                    <div className="min-w-0 flex-1">
                      <div className="mb-2 flex flex-wrap items-center gap-1.5 text-[11px] font-bold">
                        <span className="rounded-md bg-indigo-50 px-1.5 py-0.5 text-indigo-700 dark:bg-brand/10 dark:text-brand">{TYPE_LABEL[q.type] ?? q.type}</span>
                        <span className="rounded-md bg-slate-100 px-1.5 py-0.5 text-slate-600 dark:bg-white/5 dark:text-slate-400">{DIFFICULTY_LABEL[q.difficulty] ?? q.difficulty}</span>
                        {q.topic && <span className="rounded-md bg-slate-100 px-1.5 py-0.5 text-slate-600 dark:bg-white/5 dark:text-slate-400">{q.topic}</span>}
                        {q.status !== 'APPROVED' && <span className="rounded-md bg-amber-100 px-1.5 py-0.5 text-amber-800 dark:bg-amber-500/10 dark:text-amber-300">{STATUS_LABEL[q.status] ?? q.status}</span>}
                        {q.mine && !isAdmin && <span className="rounded-md bg-emerald-100 px-1.5 py-0.5 text-emerald-800 dark:bg-emerald-500/10 dark:text-emerald-300">Yours</span>}
                        {sourceOf(q) && <span className="text-slate-400 dark:text-slate-500">{sourceOf(q)}</span>}
                      </div>
                      <div className="text-sm text-slate-900 dark:text-slate-100"><MathRenderer content={q.content} /></div>
                      <QuestionFigures questionId={q.id} />
                      {options.length > 0 && (
                        <ol className="mt-2 grid gap-x-6 gap-y-1 text-sm text-slate-700 dark:text-slate-300 sm:grid-cols-2">
                          {options.map((o, k) => (
                            <li key={k} className="flex gap-1.5"><span className="font-bold text-slate-400">({String.fromCharCode(97 + k)})</span><span className="min-w-0"><MathRenderer content={o} /></span></li>
                          ))}
                        </ol>
                      )}
                      <button type="button" onClick={() => setShown((s) => { const n = new Set(s); if (n.has(q.id)) n.delete(q.id); else n.add(q.id); return n; })}
                        className="mt-2 inline-flex items-center gap-1 text-xs font-bold text-indigo-600 dark:text-brand">
                        {open ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />} {open ? 'Hide answer and solution' : 'Show answer and solution'}
                      </button>
                      {open && (
                        <div className="mt-2 space-y-2 rounded-xl bg-slate-50 p-3 text-sm dark:bg-white/5">
                          <p className="text-slate-700 dark:text-slate-300"><span className="font-black">Answer: </span>{q.correctAnswer ? <MathRenderer content={q.correctAnswer} /> : <span className="italic text-slate-400">not recorded</span>}</p>
                          {q.explanation ? <div className="text-slate-700 dark:text-slate-300"><MathRenderer content={q.explanation} /></div> : <p className="italic text-slate-400">No worked solution yet.</p>}
                        </div>
                      )}
                    </div>
                  </div>
                </li>
              );
            })}
          </ol>

          {pages > 1 && (
            <nav aria-label="Pages" className="mt-4 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <button type="button" disabled={page <= 1 || loading} onClick={() => setPage((p) => p - 1)} className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-bold disabled:opacity-40 dark:border-white/10 dark:bg-surface dark:text-slate-200"><ChevronLeft className="h-4 w-4" /> Previous</button>
                <span className="text-sm font-bold tabular-nums text-slate-600 dark:text-slate-300">Page {page} of {pages}</span>
                <button type="button" disabled={page >= pages || loading} onClick={() => setPage((p) => p + 1)} className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-bold disabled:opacity-40 dark:border-white/10 dark:bg-surface dark:text-slate-200">Next <ChevronRight className="h-4 w-4" /></button>
              </div>
              <label className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
                Per page
                <select id="qb-page-size" value={pageSize} onChange={(e) => { setPageSize(Number(e.target.value)); setPage(1); }} className="rounded-lg border border-slate-200 bg-white px-2 py-1 dark:border-white/10 dark:bg-surface">
                  {[25, 50, 100].map((n) => <option key={n} value={n}>{n}</option>)}
                </select>
              </label>
            </nav>
          )}
        </section>
      </div>

      {/* ---------------- selection tray ---------------- */}
      {picked.length > 0 && (
        <div data-testid="qb-tray" className="sticky bottom-0 z-20 -mx-4 mt-2 border-t border-slate-200 bg-white/95 px-4 py-3 shadow-[0_-8px_24px_-12px_rgb(15_23_42/0.25)] backdrop-blur dark:border-white/10 dark:bg-surface/95 sm:-mx-6 sm:px-6">
          {trayOpen && (
            <ol className="mb-3 max-h-64 space-y-1 overflow-y-auto pr-1">
              {picked.map((p, i) => (
                <li key={p.id} className="flex items-center gap-2 rounded-lg bg-slate-50 px-2 py-1.5 text-xs dark:bg-white/5">
                  <span className="w-6 shrink-0 text-right font-black tabular-nums text-slate-400">{i + 1}.</span>
                  <span className="min-w-0 flex-1 text-slate-700 dark:text-slate-300" title={p.source}>
                    {/* The question as it displays, clipped to one line; older saved picks have only a plain preview. */}
                    <span className="block max-h-6 overflow-hidden [&_.katex-display]:my-0 [&_p]:my-0">{p.content ? <MathRenderer content={p.content} /> : p.preview || '(no text)'}</span>
                    <span className="block truncate text-[11px] text-slate-400">{TYPE_LABEL[p.type] ?? p.type}{p.source ? ` · ${p.source}` : ''}</span>
                  </span>
                  <button type="button" aria-label="Move up" disabled={i === 0} onClick={() => move(i, -1)} className="rounded p-1 text-slate-400 hover:text-indigo-600 disabled:opacity-30"><ArrowUp className="h-3.5 w-3.5" /></button>
                  <button type="button" aria-label="Move down" disabled={i === picked.length - 1} onClick={() => move(i, 1)} className="rounded p-1 text-slate-400 hover:text-indigo-600 disabled:opacity-30"><ArrowDown className="h-3.5 w-3.5" /></button>
                  <button type="button" aria-label="Remove" onClick={() => setPicked((l) => l.filter((x) => x.id !== p.id))} className="rounded p-1 text-slate-400 hover:text-rose-600"><X className="h-3.5 w-3.5" /></button>
                </li>
              ))}
            </ol>
          )}
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-black text-slate-900 dark:text-white">{picked.length} question{picked.length === 1 ? '' : 's'} selected</span>
            <button type="button" onClick={() => setTrayOpen((o) => !o)} className="rounded-lg px-2.5 py-1.5 text-xs font-bold text-indigo-600 hover:bg-indigo-50 dark:text-brand dark:hover:bg-white/5">{trayOpen ? 'Hide list' : 'Review and order'}</button>
            <button type="button" onClick={() => { setPicked([]); setTrayOpen(false); }} className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-bold text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-white/5"><Trash2 className="h-3.5 w-3.5" /> Clear</button>
            <button type="button" data-testid="qb-add" onClick={() => setDialogOpen(true)} className="ml-auto inline-flex items-center gap-2 rounded-xl bg-gradient-to-br from-indigo-600 to-violet-600 px-4 py-2.5 text-sm font-black text-white shadow-sm hover:opacity-90 dark:from-brand dark:to-brand-violet">
              <FilePlus2 className="h-4 w-4" /> Add to a paper or sheet
            </button>
          </div>
        </div>
      )}

      {dialogOpen && (
        <AddToPaperDialog
          role={role}
          picked={picked}
          defaultClass={filters.class || book?.className || ''}
          defaultTitle={[chapter?.name ?? book?.title, filters.topic].filter(Boolean).join(' · ')}
          onClose={() => setDialogOpen(false)}
          onDone={() => { setPicked([]); setTrayOpen(false); }}
        />
      )}
    </div>
  );
}

type TestSummary = { id: string; title: string; isPublished: boolean; templateType: string | null; questionCount: number };
type Result = { test: { id: string; title: string }; created: boolean; added: number; alreadyIn: number; refused: number; questionCount: number };

function AddToPaperDialog({ role, picked, defaultClass, defaultTitle, onClose, onDone }: {
  role: 'ADMIN' | 'TEACHER'; picked: Picked[]; defaultClass: string; defaultTitle: string; onClose: () => void; onDone: () => void;
}) {
  const [mode, setMode] = useState<'new' | 'existing'>('new');
  const [kind, setKind] = useState<'paper' | 'sheet'>('sheet');
  const [title, setTitle] = useState(defaultTitle ? `Practice sheet: ${defaultTitle}` : '');
  const [className, setClassName] = useState(defaultClass);
  const [duration, setDuration] = useState('30');
  const [marks, setMarks] = useState('1');
  const [negative, setNegative] = useState('0');
  const [tests, setTests] = useState<TestSummary[] | null>(null);
  const [testId, setTestId] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);

  useEffect(() => {
    fetch('/api/teacher/tests/list').then((r) => r.json()).then((d) => {
      const open = (d.tests ?? []).filter((t: TestSummary) => !t.isPublished);
      setTests(open);
      if (open[0]) setTestId(open[0].id);
    }).catch(() => setTests([]));
  }, []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const switchKind = (next: 'paper' | 'sheet') => {
    setKind(next);
    setDuration(next === 'sheet' ? '30' : '60');
    setTitle((t) => t.replace(/^(Practice sheet|Question paper): /, `${next === 'sheet' ? 'Practice sheet' : 'Question paper'}: `));
  };

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      const body = mode === 'existing'
        ? { questionIds: picked.map((p) => p.id), testId }
        : { questionIds: picked.map((p) => p.id), newTitle: title, kind, className, duration: Number(duration), marksPerQuestion: Number(marks), negativeMarks: Number(negative) };
      const res = await fetch('/api/teacher/tests/collect-many', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not add the questions');
      setResult(data);
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not add the questions');
    } finally {
      setBusy(false);
    }
  };

  const field = 'w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm dark:border-white/10 dark:bg-surface dark:text-white';
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/40 p-4 sm:items-center" onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-labelledby="qb-dialog-title" onClick={(e) => e.stopPropagation()} className="w-full max-w-lg rounded-2xl bg-white p-5 shadow-2xl dark:bg-surface">
        <div className="mb-4 flex items-start justify-between gap-3">
          <h2 id="qb-dialog-title" className="font-display text-lg font-black text-slate-900 dark:text-white">
            {result ? 'Added' : `Add ${picked.length} question${picked.length === 1 ? '' : 's'}`}
          </h2>
          <button type="button" onClick={onClose} aria-label="Close" className="rounded-lg p-1 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"><X className="h-5 w-5" /></button>
        </div>

        {result ? (
          <div className="space-y-4" data-testid="qb-result">
            <p className="text-sm text-slate-700 dark:text-slate-300">
              <b>{result.test.title}</b> {result.created ? 'was created with' : 'now has'} {result.questionCount} question{result.questionCount === 1 ? '' : 's'}.
              {!result.created && ` ${result.added} added.`}
              {result.alreadyIn > 0 && ` ${result.alreadyIn} were already in it.`}
              {result.refused > 0 && ` ${result.refused} could not be used (not approved).`}
              {' '}It is not published yet, so students do not see it.
            </p>
            <div className="flex flex-wrap gap-2">
              {role === 'TEACHER' ? (
                <>
                  <Link href={`/teacher/tests/${result.test.id}/assign`} className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-4 py-2 text-sm font-black text-white dark:bg-brand"><ClipboardList className="h-4 w-4" /> Publish and assign</Link>
                  <Link href={`/teacher/tests/${result.test.id}/print`} className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-bold text-slate-700 dark:border-white/15 dark:text-slate-200">Print</Link>
                  <Link href="/teacher/tests" className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-bold text-slate-700 dark:border-white/15 dark:text-slate-200">My tests</Link>
                </>
              ) : (
                <Link href="/admin/dashboard?tab=Test%20%26%20Exam%20Engine" className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-4 py-2 text-sm font-black text-white dark:bg-brand"><BookOpen className="h-4 w-4" /> Open Test &amp; Exam Engine</Link>
              )}
              <button type="button" onClick={onClose} className="rounded-xl px-4 py-2 text-sm font-bold text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-white/5">Keep finding questions</button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div role="tablist" className="grid grid-cols-2 gap-1 rounded-xl bg-slate-100 p-1 dark:bg-white/5">
              {([['new', 'Start a new one'], ['existing', 'Add to one I started']] as const).map(([v, label]) => (
                <button key={v} role="tab" type="button" aria-selected={mode === v} onClick={() => setMode(v)}
                  className={`rounded-lg px-3 py-1.5 text-sm font-bold ${mode === v ? 'bg-white text-slate-900 shadow-sm dark:bg-white/15 dark:text-white' : 'text-slate-600 dark:text-slate-400'}`}>{label}</button>
              ))}
            </div>

            {mode === 'new' ? (
              <>
                <fieldset className="grid grid-cols-2 gap-2">
                  <legend className={labelCls}>What it is</legend>
                  {([['sheet', 'Practice sheet', 'Reusable worksheet, kept as a template'], ['paper', 'Question paper', 'A test to assign or print']] as const).map(([v, label, hint]) => (
                    <label key={v} className={`cursor-pointer rounded-xl border p-3 ${kind === v ? 'border-indigo-500 bg-indigo-50 dark:border-brand dark:bg-brand/10' : 'border-slate-200 dark:border-white/10'}`}>
                      <input type="radio" name="qb-kind" value={v} checked={kind === v} onChange={() => switchKind(v)} className="sr-only" />
                      <span className="block text-sm font-black text-slate-900 dark:text-white">{label}</span>
                      <span className="block text-xs text-slate-500 dark:text-slate-400">{hint}</span>
                    </label>
                  ))}
                </fieldset>
                <label className="block"><span className={labelCls}>Title</span><input id="qb-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder={kind === 'sheet' ? 'Practice sheet: Integrals' : 'Unit test: Integrals'} className={field} /></label>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <label className="col-span-2 block sm:col-span-1"><span className={labelCls}>Class</span><input id="qb-new-class" value={className} onChange={(e) => setClassName(e.target.value)} placeholder="Class 12" className={field} /></label>
                  <label className="block"><span className={labelCls}>Minutes</span><input id="qb-duration" type="number" min={1} value={duration} onChange={(e) => setDuration(e.target.value)} className={field} /></label>
                  <label className="block"><span className={labelCls}>Marks each</span><input id="qb-marks" type="number" min={0} step="0.5" value={marks} onChange={(e) => setMarks(e.target.value)} className={field} /></label>
                  <label className="block"><span className={labelCls}>Minus wrong</span><input id="qb-negative" type="number" min={0} step="0.25" value={negative} onChange={(e) => setNegative(e.target.value)} className={field} /></label>
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400">The questions go into one section, in the order of your selection (use Review and order to change it first). Every question gets the same marks.</p>
              </>
            ) : tests === null ? (
              <p className="flex items-center gap-2 text-sm text-slate-500"><Loader2 className="h-4 w-4 animate-spin" /> Loading your unpublished papers…</p>
            ) : tests.length === 0 ? (
              <p className="text-sm text-slate-500 dark:text-slate-400">You have no unpublished papers or sheets. Start a new one instead.</p>
            ) : (
              <label className="block">
                <span className={labelCls}>Unpublished paper or sheet</span>
                <select id="qb-existing" value={testId} onChange={(e) => setTestId(e.target.value)} className={field}>
                  {tests.map((t) => <option key={t.id} value={t.id}>{t.title} · {t.templateType === 'WORKSHEET' ? 'practice sheet' : 'paper'} · {t.questionCount} questions</option>)}
                </select>
                <span className="mt-1 block text-xs text-slate-500 dark:text-slate-400">They are added at the end; any already in it are skipped.</span>
              </label>
            )}

            {error && <p role="alert" className="rounded-lg bg-rose-50 px-3 py-2 text-sm font-bold text-rose-800 dark:bg-rose-500/10 dark:text-rose-300">{error}</p>}
            <div className="flex justify-end gap-2">
              <button type="button" onClick={onClose} className="rounded-xl px-4 py-2 text-sm font-bold text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-white/5">Cancel</button>
              <button type="button" data-testid="qb-confirm" onClick={() => void submit()}
                disabled={busy || (mode === 'new' ? !title.trim() : !testId)}
                className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2 text-sm font-black text-white disabled:opacity-50 dark:bg-brand">
                {busy && <Loader2 className="h-4 w-4 animate-spin" />} {mode === 'new' ? `Create ${kind === 'sheet' ? 'practice sheet' : 'question paper'}` : 'Add to it'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
