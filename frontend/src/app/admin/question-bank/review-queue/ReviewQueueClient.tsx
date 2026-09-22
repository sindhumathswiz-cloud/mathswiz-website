'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, ArrowLeft, Archive, CheckCircle2, History, Loader2, Search, Sparkles, X } from 'lucide-react';
import MathRenderer from '@/components/MathRenderer';

interface QuestionRow {
  id: string;
  content: string;
  options: unknown;
  correctAnswer: string | null;
  type: string;
  status: string;
  verificationStatus: string;
  tags: string[];
  reviewNotes: string | null;
  topic: string | null;
  subTopic: string | null;
  sourcePageStart: number | null;
  bookId: string | null;
  book: { title: string } | null;
  // Roadmap Phase 3: composed from the provenance/structural/figure approval
  // gates (lib/question-risk.ts) -- blockers are the exact reasons this row
  // would be rejected if someone tried to approve it right now.
  risk?: { score: number; blockers: string[] };
}

interface BookOption {
  id: string;
  title: string;
  className: string;
}

interface QuestionVersionRow {
  id: string;
  version: number;
  content: string;
  correctAnswer: string | null;
  explanation: string | null;
  changedBy: string;
  changeReason: string | null;
  createdAt: string;
}

// The latest structured review-note block, so a reviewer sees the most
// recent evidence/verdict first rather than the full accumulated history.
function latestNote(reviewNotes: string | null): string | null {
  if (!reviewNotes) return null;
  const markers = ['[Second Review --', '[AI-Verified --', '[Gate-Swept --', '[Resolved --'];
  let lastIndex = -1;
  for (const marker of markers) {
    const idx = reviewNotes.lastIndexOf(marker);
    if (idx > lastIndex) lastIndex = idx;
  }
  return lastIndex >= 0 ? reviewNotes.slice(lastIndex) : reviewNotes;
}

// Light client-side categorization from the note's own "Needs:" line -- no
// new schema, just reading the structure the review-writing scripts already
// produce.
function needsCategory(note: string | null): string {
  if (!note) return 'other';
  const m = note.match(/Needs:\s*(.+)/);
  if (!m) return 'other';
  const text = m[1].toLowerCase();
  if (text.includes('source recovery')) return 'source';
  if (text.includes('teacher confirmation')) return 'teacher';
  if (text.includes('diagram')) return 'diagram';
  if (text.includes('none')) return 'ai';
  return 'other';
}

const CATEGORY_LABELS: Record<string, string> = {
  all: 'All',
  source: 'Needs source recovery',
  teacher: 'Needs teacher confirmation',
  diagram: 'Needs diagram',
  ai: 'AI-flagged',
  other: 'Other',
};

export default function ReviewQueueClient() {
  const [books, setBooks] = useState<BookOption[]>([]);
  const [bookId, setBookId] = useState('');
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState<string>('all');
  const [questions, setQuestions] = useState<QuestionRow[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [message, setMessage] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);
  const [historyForId, setHistoryForId] = useState<string | null>(null);
  const [historyVersions, setHistoryVersions] = useState<QuestionVersionRow[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  useEffect(() => {
    fetch('/api/admin/books').then((r) => r.json()).then((d) => setBooks(d.books ?? [])).catch(() => {});
  }, []);

  const query = useCallback((cursor?: string) => {
    const params = new URLSearchParams();
    if (bookId) params.set('bookId', bookId);
    if (search.trim()) params.set('search', search.trim());
    if (cursor) params.set('cursor', cursor);
    return params.toString();
  }, [bookId, search]);

  const load = useCallback(async () => {
    setLoading(true);
    setMessage(null);
    try {
      const res = await fetch(`/api/admin/questions/review-queue?${query()}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to load the review queue');
      setQuestions(data.questions ?? []);
      setNextCursor(data.nextCursor ?? null);
    } catch (e) {
      setMessage({ kind: 'error', text: e instanceof Error ? e.message : 'Failed to load' });
    } finally {
      setLoading(false);
    }
  }, [query]);
  useEffect(() => { void load(); }, [load]);

  const loadMore = async () => {
    if (!nextCursor) return;
    setLoadingMore(true);
    try {
      const res = await fetch(`/api/admin/questions/review-queue?${query(nextCursor)}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to load more');
      setQuestions((prev) => [...prev, ...(data.questions ?? [])]);
      setNextCursor(data.nextCursor ?? null);
    } catch (e) {
      setMessage({ kind: 'error', text: e instanceof Error ? e.message : 'Failed to load more' });
    } finally {
      setLoadingMore(false);
    }
  };

  const resolve = async (id: string) => {
    setBusyId(id);
    setMessage(null);
    try {
      const res = await fetch(`/api/admin/questions/${id}/resolve-flag`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'resolve' }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to resolve');
      setQuestions((prev) => prev.filter((q) => q.id !== id));
      setMessage({ kind: 'success', text: 'Marked resolved.' });
    } catch (e) {
      setMessage({ kind: 'error', text: e instanceof Error ? e.message : 'Failed to resolve' });
    } finally {
      setBusyId(null);
    }
  };

  const archive = async (id: string) => {
    setBusyId(id);
    setMessage(null);
    try {
      const res = await fetch(`/api/questions/${id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'ARCHIVED', reviewNotes: `[Archived from review queue -- ${new Date().toISOString().slice(0, 10)}]` }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to archive');
      setQuestions((prev) => prev.filter((q) => q.id !== id));
      setMessage({ kind: 'success', text: 'Archived.' });
    } catch (e) {
      setMessage({ kind: 'error', text: e instanceof Error ? e.message : 'Failed to archive' });
    } finally {
      setBusyId(null);
    }
  };

  const openHistory = async (id: string) => {
    setHistoryForId(id);
    setLoadingHistory(true);
    setHistoryVersions([]);
    try {
      const res = await fetch(`/api/admin/questions/${id}/versions`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to load history');
      setHistoryVersions(data.versions ?? []);
    } catch (e) {
      setMessage({ kind: 'error', text: e instanceof Error ? e.message : 'Failed to load history' });
      setHistoryForId(null);
    } finally {
      setLoadingHistory(false);
    }
  };

  const filtered = useMemo(() => {
    if (category === 'all') return questions;
    return questions.filter((q) => needsCategory(latestNote(q.reviewNotes)) === category);
  }, [questions, category]);

  return (
    <main className="mx-auto max-w-5xl px-4 py-8">
      <Link href="/admin/question-bank/books" className="mb-3 inline-flex items-center gap-2 text-sm font-bold text-indigo-600">
        <ArrowLeft className="h-4 w-4" /> Book Ingestion Library
      </Link>

      <header className="mb-5">
        <h1 className="text-2xl font-black text-slate-900">Review queue</h1>
        <p className="mt-1 text-xs font-bold text-slate-400">
          Every open question the approval gates would reject right now, or that's been flagged by the second review or the automated AI verification pass — riskiest first.
        </p>
      </header>

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <select value={bookId} onChange={(e) => setBookId(e.target.value)} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm">
          <option value="">All books</option>
          {books.map((b) => <option key={b.id} value={b.id}>{b.title} · {b.className}</option>)}
        </select>
        <label className="inline-flex flex-1 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm">
          <Search className="h-4 w-4 text-slate-400" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search content…" className="w-full min-w-0 outline-none" />
        </label>
        <button onClick={() => void load()} disabled={loading} className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-black text-slate-700 hover:bg-slate-50 disabled:opacity-60">
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Refresh
        </button>
      </div>

      <div className="mb-5 flex flex-wrap gap-2">
        {Object.entries(CATEGORY_LABELS).map(([key, label]) => (
          <button key={key} onClick={() => setCategory(key)}
            className={`rounded-lg px-3 py-1.5 text-xs font-black ${category === key ? 'bg-indigo-600 text-white' : 'border border-slate-200 bg-white text-slate-600'}`}>
            {label}
          </button>
        ))}
      </div>

      {message && (
        <div className={`mb-5 rounded-xl border px-4 py-3 text-sm font-bold ${message.kind === 'success' ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-rose-200 bg-rose-50 text-rose-800'}`}>
          {message.text}
        </div>
      )}

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-slate-500"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</div>
      ) : filtered.length === 0 ? (
        <div className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-500">
          <CheckCircle2 className="h-4 w-4 text-emerald-500" /> Nothing flagged in this view.
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4">
          {filtered.map((q) => {
            const note = latestNote(q.reviewNotes);
            const busy = busyId === q.id;
            const aiFlagged = q.tags.includes('AI-Verified: Flagged');
            return (
              <article key={q.id} className="rounded-2xl border border-amber-200 bg-white p-4 shadow-sm">
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-xs font-bold text-slate-500">
                  <span className="inline-flex items-center gap-1.5">
                    {aiFlagged ? <Sparkles className="h-3.5 w-3.5 text-indigo-500" /> : <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />}
                    {q.book ? `${q.book.title} · ` : 'Non-book · '}{q.topic || 'Untopiced'}{q.subTopic ? ` / ${q.subTopic}` : ''}
                    {q.sourcePageStart ? ` · p.${q.sourcePageStart}` : ''}
                  </span>
                  <span className="flex items-center gap-2">
                    {q.risk && (
                      <span className={`rounded-md px-2 py-0.5 font-black ${q.risk.score < 40 ? 'bg-rose-100 text-rose-700' : q.risk.score < 70 ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700'}`}>
                        Risk {q.risk.score}
                      </span>
                    )}
                    <span className="rounded-md bg-slate-100 px-2 py-0.5 text-slate-500">{q.status} · {q.verificationStatus}</span>
                  </span>
                </div>

                <div className="mb-3 rounded-lg bg-slate-50 p-3 text-sm text-slate-800">
                  <MathRenderer content={q.content} />
                </div>

                {q.risk && q.risk.blockers.length > 0 && (
                  <div className="mb-3 rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs text-rose-900">
                    <div className="mb-1 font-black">Would be rejected right now — {q.risk.blockers.length} blocker{q.risk.blockers.length > 1 ? 's' : ''}</div>
                    <ul className="list-disc space-y-1 pl-4">
                      {q.risk.blockers.map((b, i) => <li key={i}>{b}</li>)}
                    </ul>
                  </div>
                )}

                {note && (
                  <details className="mb-3 rounded-lg border border-amber-100 bg-amber-50 p-3 text-xs text-amber-900">
                    <summary className="cursor-pointer font-black">Evidence &amp; suggested resolution</summary>
                    <pre className="mt-2 whitespace-pre-wrap font-sans">{note}</pre>
                  </details>
                )}

                <div className="mb-3 flex flex-wrap gap-1.5">
                  {q.tags.filter((t) => t.startsWith('Second-Review:') || t.startsWith('AI-Verified:')).map((t) => (
                    <span key={t} className="rounded-md border border-slate-200 bg-white px-2 py-0.5 text-[11px] font-bold text-slate-500">{t}</span>
                  ))}
                </div>

                <div className="flex flex-wrap gap-2">
                  <button onClick={() => void resolve(q.id)} disabled={busy}
                    className="inline-flex items-center gap-1 rounded-lg border border-emerald-300 bg-emerald-50 px-2.5 py-1.5 text-xs font-black text-emerald-700 disabled:opacity-50">
                    {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />} Mark resolved
                  </button>
                  <button onClick={() => void archive(q.id)} disabled={busy}
                    className="inline-flex items-center gap-1 rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs font-black text-slate-700 hover:bg-slate-50 disabled:opacity-60">
                    {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Archive className="h-3.5 w-3.5" />} Archive
                  </button>
                  <button onClick={() => void openHistory(q.id)}
                    className="inline-flex items-center gap-1 rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs font-black text-slate-700 hover:bg-slate-50">
                    <History className="h-3.5 w-3.5" /> History
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      )}

      {nextCursor && (
        <div className="mt-5 flex justify-center">
          <button onClick={() => void loadMore()} disabled={loadingMore} className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-black text-slate-700 hover:bg-slate-50 disabled:opacity-60">
            {loadingMore ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Load more
          </button>
        </div>
      )}

      {historyForId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="max-h-[80vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-black text-slate-900 flex items-center gap-2"><History className="h-5 w-5 text-indigo-500" /> Version history</h2>
              <button onClick={() => setHistoryForId(null)}><X className="h-5 w-5 text-slate-400" /></button>
            </div>

            {loadingHistory ? (
              <div className="flex items-center gap-2 text-sm text-slate-500"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</div>
            ) : historyVersions.length === 0 ? (
              <p className="text-sm text-slate-500">No prior versions — this question has never had a content edit recorded.</p>
            ) : (
              <div className="space-y-3">
                {historyVersions.map((v) => (
                  <div key={v.id} className="rounded-xl border border-slate-200 p-3">
                    <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2 text-xs font-bold text-slate-500">
                      <span>Version {v.version}{v.changeReason ? ` · ${v.changeReason}` : ''}</span>
                      <span>{new Date(v.createdAt).toLocaleString('en-IN')}</span>
                    </div>
                    <div className="rounded-lg bg-slate-50 p-2.5 text-sm text-slate-800">
                      <MathRenderer content={v.content} />
                    </div>
                    {v.correctAnswer && (
                      <p className="mt-1.5 text-xs text-slate-500">Answer at this version: <span className="font-bold text-slate-700">{v.correctAnswer}</span></p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </main>
  );
}
