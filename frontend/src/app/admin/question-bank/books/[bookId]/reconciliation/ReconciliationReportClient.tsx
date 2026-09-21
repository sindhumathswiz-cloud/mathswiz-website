'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, ArrowLeft, CheckCircle2, Loader2, RefreshCcw, ShieldCheck } from 'lucide-react';

interface ExerciseRow {
  exerciseId: string;
  chapterId: string;
  chapterName: string;
  code: string | null;
  title: string | null;
  sectionType: string | null;
  startPage: number | null;
  endPage: number | null;
  expectedQuestionCount: number | null;
  extractedQuestionCount: number;
  matchedQuestionCount: number;
  unresolvedQuestionCount: number;
  reconciledAt: string | null;
  discrepancies: string[];
}

interface Summary {
  exerciseCount: number;
  discrepantCount: number;
  totalExpected: number;
  totalExtracted: number;
  totalMatched: number;
  totalUnresolved: number;
}

const fmtDate = (iso: string | null) => (iso ? new Date(iso).toLocaleString() : 'never');

export default function ReconciliationReportClient({ bookId }: { bookId: string }) {
  const [book, setBook] = useState<{ title: string; className: string } | null>(null);
  const [runId, setRunId] = useState<string | null>(null);
  const [runStage, setRunStage] = useState<string | null>(null);
  const [exercises, setExercises] = useState<ExerciseRow[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [recalculating, setRecalculating] = useState(false);
  const [completing, setCompleting] = useState(false);
  const [message, setMessage] = useState<{ kind: 'success' | 'error' | 'info'; text: string } | null>(null);
  const [completionBlockers, setCompletionBlockers] = useState<ExerciseRow[] | null>(null);
  const [editing, setEditing] = useState<Record<string, string>>({});
  const [savingId, setSavingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setMessage(null);
    try {
      const manifestRes = await fetch(`/api/admin/books/${bookId}/manifest`);
      const manifestData = await manifestRes.json();
      if (!manifestRes.ok) throw new Error(manifestData.error || 'Failed to load this book');
      setBook(manifestData.book);
      setRunId(manifestData.run?.id ?? null);
      setRunStage(manifestData.run?.stage ?? null);

      const res = await fetch(`/api/admin/books/${bookId}/reconciliation`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to load the reconciliation report');
      setExercises(data.exercises ?? []);
      setSummary(data.summary ?? null);
    } catch (e) {
      setMessage({ kind: 'error', text: e instanceof Error ? e.message : 'Failed to load' });
    } finally {
      setLoading(false);
    }
  }, [bookId]);
  useEffect(() => { void load(); }, [load]);

  const recalculate = async () => {
    setRecalculating(true);
    setMessage(null);
    setCompletionBlockers(null);
    try {
      const res = await fetch(`/api/admin/books/${bookId}/reconciliation`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Recalculation failed');
      setExercises(data.exercises ?? []);
      setSummary(data.summary ?? null);
      setMessage({ kind: 'success', text: `Recalculated ${data.summary?.exerciseCount ?? 0} exercise(s) — ${data.summary?.discrepantCount ?? 0} with a discrepancy.` });
    } catch (e) {
      setMessage({ kind: 'error', text: e instanceof Error ? e.message : 'Recalculation failed' });
    } finally {
      setRecalculating(false);
    }
  };

  const markComplete = async () => {
    if (!runId) return;
    setCompleting(true);
    setMessage(null);
    setCompletionBlockers(null);
    try {
      const res = await fetch(`/api/admin/books/${bookId}/ingestions/${runId}/complete`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) {
        if (Array.isArray(data.discrepancies)) setCompletionBlockers(data.discrepancies);
        throw new Error(data.error || 'Could not mark this book complete');
      }
      setRunStage(data.stage);
      setMessage({ kind: 'success', text: data.alreadyComplete ? 'This book was already marked complete.' : 'Book marked complete.' });
    } catch (e) {
      setMessage({ kind: 'error', text: e instanceof Error ? e.message : 'Could not mark this book complete' });
    } finally {
      setCompleting(false);
    }
  };

  const saveExpected = async (exerciseId: string) => {
    const raw = editing[exerciseId];
    const value = raw === '' ? null : Number.parseInt(raw, 10);
    if (raw !== '' && !Number.isInteger(value)) {
      setMessage({ kind: 'error', text: 'Expected count must be a whole number.' });
      return;
    }
    setSavingId(exerciseId);
    setMessage(null);
    try {
      const res = await fetch(`/api/admin/books/${bookId}/reconciliation`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ exerciseId, expectedQuestionCount: value }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Save failed');
      setExercises(data.exercises ?? []);
      setSummary(data.summary ?? null);
      setEditing((prev) => { const next = { ...prev }; delete next[exerciseId]; return next; });
    } catch (e) {
      setMessage({ kind: 'error', text: e instanceof Error ? e.message : 'Save failed' });
    } finally {
      setSavingId(null);
    }
  };

  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <Link href="/admin/question-bank/books" className="mb-3 inline-flex items-center gap-2 text-sm font-bold text-indigo-600">
        <ArrowLeft className="h-4 w-4" /> Book Ingestion Library
      </Link>

      <header className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black text-slate-900">Exercise Reconciliation</h1>
          <p className="mt-1 text-sm text-slate-500">{book ? <>{book.title} · {book.className}</> : 'Loading…'}</p>
          <p className="mt-1 text-xs font-bold text-slate-400">
            Expected vs. extracted vs. answer/solution-matched, per confirmed exercise — the gate that decides whether this book may be marked complete.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button onClick={() => void recalculate()} disabled={recalculating || loading}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-black text-slate-700 hover:bg-slate-50 disabled:opacity-60">
            {recalculating ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCcw className="h-4 w-4" />} Recalculate
          </button>
          <button onClick={() => void markComplete()} disabled={completing || loading || !runId || runStage === 'COMPLETED'}
            className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-black text-white hover:bg-emerald-700 disabled:opacity-50">
            {completing ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
            {runStage === 'COMPLETED' ? 'Book Complete' : 'Mark Book Complete'}
          </button>
        </div>
      </header>

      {summary && (
        <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-5">
          {[
            ['Exercises', summary.exerciseCount],
            ['With a gap', summary.discrepantCount],
            ['Expected', summary.totalExpected],
            ['Extracted', summary.totalExtracted],
            ['Unresolved', summary.totalUnresolved],
          ].map(([label, value]) => (
            <div key={label as string} className="rounded-xl border border-slate-200 bg-white px-3 py-2.5">
              <div className="text-[11px] font-black uppercase tracking-wide text-slate-400">{label}</div>
              <div className={`text-lg font-black ${label === 'With a gap' && (value as number) > 0 ? 'text-rose-600' : 'text-slate-900'}`}>{value}</div>
            </div>
          ))}
        </div>
      )}

      {message && (
        <div className={`mb-4 rounded-xl border px-4 py-3 text-sm font-bold ${
          message.kind === 'success' ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
          : message.kind === 'error' ? 'border-rose-200 bg-rose-50 text-rose-800'
          : 'border-indigo-200 bg-indigo-50 text-indigo-800'
        }`}>{message.text}</div>
      )}

      {completionBlockers && completionBlockers.length > 0 && (
        <div className="mb-5 rounded-xl border border-rose-200 bg-rose-50 p-4">
          <div className="mb-2 flex items-center gap-2 text-sm font-black text-rose-800"><AlertTriangle className="h-4 w-4" /> Left in review — not marked complete</div>
          <ul className="space-y-1 text-xs text-rose-700">
            {completionBlockers.map((row) => (
              <li key={row.exerciseId}>
                <span className="font-black">{row.chapterName}{row.code ? ` · ${row.code}` : ''}{row.title ? ` — ${row.title}` : ''}:</span> {row.discrepancies.join('; ')}
              </li>
            ))}
          </ul>
        </div>
      )}

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-slate-500"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</div>
      ) : exercises.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-500">
          No confirmed, question-bearing exercise found yet. Confirm this book&apos;s chapter manifest first, then recalculate.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
          <table className="w-full min-w-[880px] text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-left text-[11px] font-black uppercase tracking-wide text-slate-500">
                <th className="px-3 py-2.5">Chapter / Exercise</th>
                <th className="px-3 py-2.5">Expected</th>
                <th className="px-3 py-2.5">Extracted</th>
                <th className="px-3 py-2.5">Matched</th>
                <th className="px-3 py-2.5">Unresolved</th>
                <th className="px-3 py-2.5">Status</th>
                <th className="px-3 py-2.5">Reconciled</th>
              </tr>
            </thead>
            <tbody>
              {exercises.map((row) => {
                const clean = row.discrepancies.length === 0;
                const isEditing = row.exerciseId in editing;
                return (
                  <tr key={row.exerciseId} className="border-b border-slate-100 last:border-0">
                    <td className="px-3 py-2.5">
                      <div className="font-black text-slate-800">{row.chapterName}</div>
                      <div className="text-xs text-slate-500">{[row.code, row.title].filter(Boolean).join(' — ') || row.sectionType || '—'}</div>
                    </td>
                    <td className="px-3 py-2.5">
                      <input
                        inputMode="numeric"
                        value={isEditing ? editing[row.exerciseId] : row.expectedQuestionCount ?? ''}
                        placeholder="not set"
                        onChange={(e) => setEditing((prev) => ({ ...prev, [row.exerciseId]: e.target.value.replace(/[^0-9]/g, '') }))}
                        onBlur={() => { if (isEditing) void saveExpected(row.exerciseId); }}
                        disabled={savingId === row.exerciseId}
                        className="w-20 rounded-lg border border-slate-200 px-2 py-1 text-sm disabled:opacity-60"
                      />
                    </td>
                    <td className="px-3 py-2.5 font-bold text-slate-700">{row.extractedQuestionCount}</td>
                    <td className="px-3 py-2.5 font-bold text-slate-700">{row.matchedQuestionCount}</td>
                    <td className={`px-3 py-2.5 font-bold ${row.unresolvedQuestionCount > 0 ? 'text-rose-600' : 'text-slate-700'}`}>{row.unresolvedQuestionCount}</td>
                    <td className="px-3 py-2.5">
                      {clean ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-black text-emerald-700"><CheckCircle2 className="h-3.5 w-3.5" /> Clean</span>
                      ) : (
                        <span title={row.discrepancies.join('; ')} className="inline-flex items-center gap-1 rounded-full bg-rose-50 px-2 py-0.5 text-xs font-black text-rose-700"><AlertTriangle className="h-3.5 w-3.5" /> {row.discrepancies.length} gap{row.discrepancies.length > 1 ? 's' : ''}</span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-xs text-slate-400">{fmtDate(row.reconciledAt)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
