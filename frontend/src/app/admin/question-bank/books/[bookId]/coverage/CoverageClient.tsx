'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { ArrowLeft, Loader2, Shuffle } from 'lucide-react';
import { describePageList } from '@/lib/page-parity';

interface Row {
  id: string; name: string; startPage: number; endPage: number; pages: number; pagesWithQuestions: number; emptyPages: number[];
  extracted: number; approved: number; waiting: number; approvedWithSolution: number; waitingWithSolution: number;
  manifestConfirmed: boolean; exerciseCount: number; thin: boolean;
}
interface Data {
  book: { id: string; title: string };
  chapters: Row[];
  misfiled: Array<{ id: string; page: number | null; chapterName: string | null; belongsToName: string | null }>;
  totals: { extracted: number; approved: number; waiting: number; approvedWithSolution: number; pages: number; pagesWithQuestions: number };
}

/** How completely a book's questions are in, chapter by chapter, and the questions filed under no real chapter. */
export default function CoverageClient({ bookId }: { bookId: string }) {
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refiling, setRefiling] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch(`/api/admin/books/${bookId}/coverage`);
    const body = await res.json();
    if (!res.ok) setError(body.error || 'Could not load coverage'); else setData(body);
  }, [bookId]);
  useEffect(() => { void load(); }, [load]);

  const refile = async () => {
    setRefiling(true);
    try {
      const res = await fetch(`/api/admin/books/${bookId}/coverage`, { method: 'POST' });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || 'Could not refile');
      setMessage(`Refiled ${body.refiled} question${body.refiled === 1 ? '' : 's'} by page${body.leftAlone ? `; ${body.leftAlone} left alone (their page fits no single chapter)` : ''}.`);
      await load();
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      setRefiling(false);
    }
  };

  const movable = data?.misfiled.filter((m) => m.belongsToName).length ?? 0;
  const cell = 'px-3 py-2.5 text-right tabular-nums';

  return (
    <main className="min-h-screen bg-slate-50 p-6 dark:bg-background md:p-10">
      <div className="mx-auto max-w-6xl">
        <Link href="/admin/question-bank/books" className="mb-6 inline-flex items-center gap-2 text-sm font-bold text-indigo-700 dark:text-brand"><ArrowLeft className="h-4 w-4" />Book Library</Link>
        <h1 className="font-display text-3xl font-black text-slate-900 dark:text-white">Coverage{data ? `: ${data.book.title}` : ''}</h1>
        <p className="mt-1 max-w-3xl text-slate-600 dark:text-slate-400">How completely each chapter&apos;s questions are in the bank. Students see only approved questions. Pages that gave no question include theory and answer pages; a chapter with fewer questions than one per two pages is marked for a look.</p>

        {error && <p role="alert" className="mt-6 rounded-xl bg-rose-50 p-4 text-sm font-bold text-rose-700">{error}</p>}
        {!data && !error && <p className="mt-6 flex items-center gap-2 text-slate-500"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</p>}

        {data && (
          <>
            <dl className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
              {[
                ['Extracted', data.totals.extracted],
                ['Approved (students see these)', data.totals.approved],
                ['Waiting for review', data.totals.waiting],
                ['Pages with questions', `${data.totals.pagesWithQuestions} of ${data.totals.pages}`],
              ].map(([label, value]) => (
                <div key={label as string} className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-white/10 dark:bg-surface">
                  <dt className="text-[11px] font-black uppercase tracking-wider text-slate-500">{label}</dt>
                  <dd className="mt-1 text-2xl font-black tabular-nums text-slate-900 dark:text-white">{typeof value === 'number' ? value.toLocaleString('en-IN') : value}</dd>
                </div>
              ))}
            </dl>

            <div className="mt-6 overflow-x-auto rounded-2xl border border-slate-200 bg-white dark:border-white/10 dark:bg-surface">
              <table className="w-full min-w-[56rem] text-sm" data-testid="coverage-table">
                <caption className="sr-only">Coverage by chapter</caption>
                <thead>
                  <tr className="text-[11px] font-black uppercase tracking-wider text-slate-500">
                    <th scope="col" className="px-3 py-2.5 text-left">Chapter</th>
                    <th scope="col" className="px-3 py-2.5 text-right">Pages</th>
                    <th scope="col" className="px-3 py-2.5 text-right">With questions</th>
                    <th scope="col" className="px-3 py-2.5 text-right">Extracted</th>
                    <th scope="col" className="px-3 py-2.5 text-right">Approved</th>
                    <th scope="col" className="px-3 py-2.5 text-right">Waiting</th>
                    <th scope="col" className="px-3 py-2.5 text-right">With solution</th>
                    <th scope="col" className="px-3 py-2.5 text-left">Layout</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-white/5">
                  {data.chapters.map((r) => (
                    <tr key={r.id} className={r.thin ? 'bg-amber-50/60 dark:bg-amber-500/5' : ''}>
                      <th scope="row" className="px-3 py-2.5 text-left font-bold text-slate-900 dark:text-white">
                        {r.name}
                        {r.thin && <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-black uppercase text-amber-800 dark:bg-amber-500/20 dark:text-amber-300">thin</span>}
                        <span className="block text-xs font-normal text-slate-500">pp. {r.startPage}–{r.endPage}{r.emptyPages.length ? ` · no question on ${describePageList(r.emptyPages, 6)}` : ''}</span>
                      </th>
                      <td className={cell}>{r.pages}</td>
                      <td className={cell}>{r.pagesWithQuestions}</td>
                      <td className={cell}>{r.extracted}</td>
                      <td className={cell}>{r.approved}</td>
                      <td className={cell}>{r.waiting}</td>
                      <td className={cell} title="approved / waiting">{r.approvedWithSolution} / {r.waitingWithSolution}</td>
                      <td className="px-3 py-2.5 text-xs text-slate-600 dark:text-slate-400">{r.manifestConfirmed ? 'Confirmed' : 'Not confirmed'} · {r.exerciseCount} exercise{r.exerciseCount === 1 ? '' : 's'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <section aria-labelledby="misfiled-h" className="mt-8">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 id="misfiled-h" className="font-display text-xl font-black text-slate-900 dark:text-white">Misfiled questions ({data.misfiled.length})</h2>
                {movable > 0 && (
                  <button type="button" onClick={refile} disabled={refiling} data-testid="refile" className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2 text-sm font-bold text-white hover:bg-indigo-500 disabled:opacity-50 dark:bg-brand">
                    {refiling ? <Loader2 className="h-4 w-4 animate-spin" /> : <Shuffle className="h-4 w-4" />} Refile {movable} by page
                  </button>
                )}
              </div>
              {message && <p role="status" className="mt-3 rounded-xl bg-indigo-50 p-3 text-sm font-bold text-indigo-900 dark:bg-brand/10 dark:text-brand">{message}</p>}
              {data.misfiled.length === 0 ? (
                <p className="mt-3 text-sm text-slate-500">Every question is filed under one of the book&apos;s chapters.</p>
              ) : (
                <ul className="mt-3 divide-y divide-slate-100 rounded-2xl border border-slate-200 bg-white text-sm dark:divide-white/5 dark:border-white/10 dark:bg-surface">
                  {data.misfiled.map((m) => (
                    <li key={m.id} className="flex flex-wrap justify-between gap-2 px-4 py-2.5">
                      <span className="text-slate-700 dark:text-slate-300">Page {m.page ?? '?'} · under {m.chapterName ? `"${m.chapterName}"` : 'no chapter'}</span>
                      <span className="font-bold text-slate-900 dark:text-white">{m.belongsToName ? `belongs to ${m.belongsToName}` : 'page fits no single chapter'}</span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </>
        )}
      </div>
    </main>
  );
}
