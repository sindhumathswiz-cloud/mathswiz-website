'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { ArrowLeft, CheckCircle2, ImageOff, Link2, Loader2, Unlink } from 'lucide-react';

interface Candidate {
  id: string;
  printedNumber: string | null;
  content: string;
}

interface FigureRow {
  id: string;
  pageNumber: number;
  imageType: string;
  imageUrl: string;
  questionId: string | null;
  matchedAutomatically: boolean;
  reviewedAt: string | null;
  question: { id: string; printedNumber: string | null; content: string; status: string } | null;
}

const toInt = (v: string): number | null => {
  const n = parseInt(v, 10);
  return Number.isInteger(n) ? n : null;
};

export default function FiguresReviewClient({ bookId }: { bookId: string }) {
  const [book, setBook] = useState<{ title: string; className: string } | null>(null);
  const [runId, setRunId] = useState<string | null>(null);
  const [filter, setFilter] = useState<'all' | 'unmatched'>('unmatched');
  const [pageStart, setPageStart] = useState('');
  const [pageEnd, setPageEnd] = useState('');
  const [figures, setFigures] = useState<FigureRow[]>([]);
  const [pageCandidates, setPageCandidates] = useState<Record<string, Candidate[]>>({});
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [message, setMessage] = useState<{ kind: 'success' | 'error' | 'info'; text: string } | null>(null);
  const [picked, setPicked] = useState<Record<string, string>>({});

  const query = useCallback((cursor?: string) => {
    const params = new URLSearchParams();
    if (filter === 'unmatched') params.set('unmatchedOnly', 'true');
    const s = toInt(pageStart), e = toInt(pageEnd);
    if (s != null) params.set('pageStart', String(s));
    if (e != null) params.set('pageEnd', String(e));
    if (cursor) params.set('cursor', cursor);
    return params.toString();
  }, [filter, pageStart, pageEnd]);

  const load = useCallback(async () => {
    setLoading(true);
    setMessage(null);
    try {
      const manifestRes = await fetch(`/api/admin/books/${bookId}/manifest`);
      const manifestData = await manifestRes.json();
      if (!manifestRes.ok) throw new Error(manifestData.error || 'Failed to load this book');
      setBook(manifestData.book);
      const run = manifestData.run?.id ?? null;
      setRunId(run);
      if (!run) { setFigures([]); setLoading(false); return; }

      const res = await fetch(`/api/admin/books/${bookId}/ingestions/${run}/figures?${query()}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to load figures');
      setFigures(data.figures ?? []);
      setPageCandidates(data.pageCandidates ?? {});
      setNextCursor(data.nextCursor ?? null);
    } catch (e) {
      setMessage({ kind: 'error', text: e instanceof Error ? e.message : 'Failed to load' });
    } finally {
      setLoading(false);
    }
  }, [bookId, query]);
  useEffect(() => { void load(); }, [load]);

  const loadMore = async () => {
    if (!runId || !nextCursor) return;
    setLoadingMore(true);
    try {
      const res = await fetch(`/api/admin/books/${bookId}/ingestions/${runId}/figures?${query(nextCursor)}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to load more');
      setFigures((prev) => [...prev, ...(data.figures ?? [])]);
      setPageCandidates((prev) => ({ ...prev, ...(data.pageCandidates ?? {}) }));
      setNextCursor(data.nextCursor ?? null);
    } catch (e) {
      setMessage({ kind: 'error', text: e instanceof Error ? e.message : 'Failed to load more' });
    } finally {
      setLoadingMore(false);
    }
  };

  const patchFigure = async (figureId: string, body: Record<string, unknown>) => {
    if (!runId) return;
    setBusyId(figureId);
    setMessage(null);
    try {
      const res = await fetch(`/api/admin/books/${bookId}/ingestions/${runId}/figures/${figureId}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Update failed');
      if (filter === 'unmatched' && data.figure.questionId != null) {
        // No longer belongs in the unmatched list.
        setFigures((prev) => prev.filter((f) => f.id !== figureId));
      } else {
        setFigures((prev) => prev.map((f) => (f.id === figureId ? { ...f, ...data.figure, question: f.question } : f)));
      }
    } catch (e) {
      setMessage({ kind: 'error', text: e instanceof Error ? e.message : 'Update failed' });
    } finally {
      setBusyId(null);
    }
  };

  const assign = (figureId: string) => {
    const questionId = picked[figureId];
    if (!questionId) { setMessage({ kind: 'error', text: 'Pick a question first.' }); return; }
    void patchFigure(figureId, { questionId });
  };

  return (
    <main className="mx-auto max-w-5xl px-4 py-8">
      <Link href="/admin/question-bank/books" className="mb-3 inline-flex items-center gap-2 text-sm font-bold text-indigo-600 dark:text-brand">
        <ArrowLeft className="h-4 w-4" /> Book Ingestion Library
      </Link>

      <header className="mb-5">
        <h1 className="font-display text-2xl font-black text-slate-900 dark:text-white">Figures</h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{book ? <>{book.title} · {book.className}</> : 'Loading…'}</p>
        <p className="mt-1 text-xs font-bold text-slate-400 dark:text-slate-500">
          Every diagram/chart/graph detected during extraction, captured whether or not it could be matched to a question.
        </p>
      </header>

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="inline-flex rounded-xl border border-slate-200 bg-white p-1 dark:bg-surface dark:border-white/10">
          <button onClick={() => setFilter('unmatched')} className={`rounded-lg px-3 py-1.5 text-sm font-black ${filter === 'unmatched' ? 'bg-gradient-to-br from-indigo-600 to-violet-600 dark:from-brand dark:to-brand-violet text-white' : 'text-slate-600 dark:text-slate-400'}`}>Unmatched</button>
          <button onClick={() => setFilter('all')} className={`rounded-lg px-3 py-1.5 text-sm font-black ${filter === 'all' ? 'bg-gradient-to-br from-indigo-600 to-violet-600 dark:from-brand dark:to-brand-violet text-white' : 'text-slate-600 dark:text-slate-400'}`}>All</button>
        </div>
        <label className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-700 dark:bg-surface dark:border-white/10 dark:text-slate-300">
          Pages
          <input inputMode="numeric" placeholder="start" value={pageStart} onChange={(e) => setPageStart(e.target.value)} className="w-16 rounded-lg border border-slate-200 px-2 py-1 text-sm dark:border-white/10" />
          <span className="text-slate-400 dark:text-slate-500">–</span>
          <input inputMode="numeric" placeholder="end" value={pageEnd} onChange={(e) => setPageEnd(e.target.value)} className="w-16 rounded-lg border border-slate-200 px-2 py-1 text-sm dark:border-white/10" />
        </label>
        <button onClick={() => void load()} disabled={loading} className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-black text-slate-700 hover:bg-slate-50 disabled:opacity-60 dark:bg-surface dark:border-white/10 dark:text-slate-300 hover:dark:bg-surface-muted">
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Refresh
        </button>
      </div>

      {message && (
        <div className={`mb-5 rounded-xl border px-4 py-3 text-sm font-bold ${
          message.kind === 'success' ? 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-400'
          : message.kind === 'error' ? 'border-rose-200 bg-rose-50 text-rose-800 dark:border-rose-500/20 dark:bg-rose-500/10 dark:text-rose-400'
          : 'border-indigo-200 bg-indigo-50 text-indigo-800 dark:border-brand/20 dark:bg-brand/10 dark:text-brand'
        }`}>{message.text}</div>
      )}

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</div>
      ) : figures.length === 0 ? (
        <div className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-500 dark:bg-surface dark:border-white/10 dark:text-slate-400">
          <ImageOff className="h-4 w-4" /> {filter === 'unmatched' ? 'No unmatched figures — everything detected has a question.' : 'No figures captured yet for this book.'}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {figures.map((f) => {
            const candidates = pageCandidates[String(f.pageNumber)] ?? [];
            const busy = busyId === f.id;
            return (
              <article key={f.id} className={`rounded-2xl border bg-white dark:bg-surface p-3 ${f.questionId ? 'border-emerald-200 dark:border-emerald-500/30' : 'border-slate-200 dark:border-white/10'}`}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={f.imageUrl} alt={`Figure on page ${f.pageNumber}`} className="mb-2 h-40 w-full rounded-lg border border-slate-100 object-contain bg-slate-50 dark:bg-surface-muted dark:border-white/10" />
                <div className="mb-2 flex items-center justify-between text-xs font-bold text-slate-500 dark:text-slate-400">
                  <span>Page {f.pageNumber} · {f.imageType}</span>
                  {f.questionId ? (
                    <span className="inline-flex items-center gap-1 text-emerald-700 dark:text-emerald-400"><CheckCircle2 className="h-3.5 w-3.5" /> {f.matchedAutomatically ? 'auto-matched' : 'manually set'}</span>
                  ) : (
                    <span className="text-slate-400 dark:text-slate-500">unmatched</span>
                  )}
                </div>

                {f.questionId && f.question ? (
                  <div className="mb-2 rounded-lg bg-slate-50 p-2 text-xs text-slate-700 dark:bg-surface-muted dark:text-slate-300">
                    <span className="font-black">#{f.question.printedNumber || '—'}</span> {f.question.content}
                  </div>
                ) : null}

                <div className="flex flex-wrap items-center gap-2">
                  {f.questionId ? (
                    <button onClick={() => void patchFigure(f.id, { questionId: null })} disabled={busy}
                      className="inline-flex items-center gap-1 rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs font-black text-slate-700 hover:bg-slate-50 disabled:opacity-60 dark:border-white/10 dark:text-slate-300 hover:dark:bg-surface-muted">
                      {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Unlink className="h-3.5 w-3.5" />} Unassign
                    </button>
                  ) : (
                    <>
                      <select
                        value={picked[f.id] ?? ''}
                        onChange={(e) => setPicked((prev) => ({ ...prev, [f.id]: e.target.value }))}
                        className="min-w-0 flex-1 rounded-lg border border-slate-200 px-2 py-1.5 text-xs dark:border-white/10"
                      >
                        <option value="">{candidates.length ? 'Assign to question…' : 'No questions on this page'}</option>
                        {candidates.map((c) => (
                          <option key={c.id} value={c.id}>#{c.printedNumber || '—'} — {c.content.slice(0, 40)}</option>
                        ))}
                      </select>
                      <button onClick={() => assign(f.id)} disabled={busy || !picked[f.id]}
                        className="inline-flex items-center gap-1 rounded-lg border border-indigo-300 bg-indigo-50 px-2.5 py-1.5 text-xs font-black text-indigo-700 disabled:opacity-50 dark:text-brand dark:bg-brand/10">
                        {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Link2 className="h-3.5 w-3.5" />} Assign
                      </button>
                      <button onClick={() => void patchFigure(f.id, { reviewed: true })} disabled={busy}
                        className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-bold text-slate-500 hover:bg-slate-50 disabled:opacity-60 dark:border-white/10 dark:text-slate-400 hover:dark:bg-surface-muted">
                        Not useful
                      </button>
                    </>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}

      {nextCursor && (
        <div className="mt-5 flex justify-center">
          <button onClick={() => void loadMore()} disabled={loadingMore} className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-black text-slate-700 hover:bg-slate-50 disabled:opacity-60 dark:bg-surface dark:border-white/10 dark:text-slate-300 hover:dark:bg-surface-muted">
            {loadingMore ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Load more
          </button>
        </div>
      )}
    </main>
  );
}
