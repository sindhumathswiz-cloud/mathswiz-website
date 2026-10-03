'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, ArrowLeft, CheckCircle2, ChevronDown, ChevronUp, GitCompareArrows, Loader2, RefreshCcw, Undo2 } from 'lucide-react';

type Provider = 'GEMINI_VISION' | 'MATHPIX_OCR';

interface Coverage { totalPages: number; ready: number; mathpixOnly: number; geminiOnly: number; noReading: number }
interface Summary { reconciledPages: number; clean: number; hasHolds: number; reviewed: number; insufficientEvidence: number; heldBlocks: number; agreementBlocks: number }
interface HeldBlock { blockIndex: number; similarity: number; critical: boolean; preview: string; blockOnlyTokens: string[]; candidateOnlyTokens: string[] }
interface AttentionPage {
  pageNumber: number;
  status: 'HAS_HOLDS' | 'REVIEWED';
  heldBlocks: number;
  agreementBlocks: number;
  heldPrintedNumbers: string[];
  heldBlockDetails: HeldBlock[];
  pairing: { primary: string; primaryOrigin: 'BENCHMARK' | 'EXTRACTION'; secondary: string } | null;
  resolution: { reviewedAt?: string; note?: string | null } | null;
}

type Message = { kind: 'success' | 'error' | 'info'; text: string };

const PROVIDER_LABEL: Record<Provider, string> = { GEMINI_VISION: 'Gemini', MATHPIX_OCR: 'Mathpix' };
const card = 'rounded-xl border border-slate-200 bg-white px-3 py-2.5 dark:bg-surface dark:border-white/10';
const secondaryButton = 'inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-black text-slate-700 hover:bg-slate-50 disabled:opacity-60 dark:bg-surface dark:border-white/10 dark:text-slate-300 hover:dark:bg-surface-muted';

export default function ProviderAgreementClient({ bookId }: { bookId: string }) {
  const [book, setBook] = useState<{ title: string; className: string } | null>(null);
  const [runId, setRunId] = useState<string | null>(null);
  const [coverage, setCoverage] = useState<Coverage | null>(null);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [pages, setPages] = useState<AttentionPage[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<Message | null>(null);
  const [pageInput, setPageInput] = useState('');
  const [expanded, setExpanded] = useState<number | null>(null);
  const [notes, setNotes] = useState<Record<number, string>>({});
  const [view, setView] = useState<'HAS_HOLDS' | 'REVIEWED'>('HAS_HOLDS');

  const endpoint = runId ? `/api/admin/books/${bookId}/ingestions/${runId}` : null;

  const loadAgreement = useCallback(async (run: string) => {
    const res = await fetch(`/api/admin/books/${bookId}/ingestions/${run}/reconcile`);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to load provider agreement');
    setCoverage(data.coverage);
    setSummary(data.summary);
    setPages(data.pages ?? []);
  }, [bookId]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const manifestRes = await fetch(`/api/admin/books/${bookId}/manifest`);
      const manifest = await manifestRes.json();
      if (!manifestRes.ok) throw new Error(manifest.error || 'Failed to load this book');
      setBook(manifest.book);
      const run = manifest.run?.id ?? null;
      setRunId(run);
      if (run) await loadAgreement(run);
    } catch (e) {
      setMessage({ kind: 'error', text: e instanceof Error ? e.message : 'Failed to load' });
    } finally {
      setLoading(false);
    }
  }, [bookId, loadAgreement]);
  useEffect(() => { void load(); }, [load]);

  const requestedPage = () => {
    const value = Number.parseInt(pageInput, 10);
    return Number.isInteger(value) && value >= 1 ? value : null;
  };

  const compare = async (pageNumber?: number) => {
    if (!endpoint || !runId) return;
    setBusy(pageNumber ? `compare:${pageNumber}` : 'compare:all');
    setMessage(null);
    try {
      const res = await fetch(`${endpoint}/reconcile`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(pageNumber ? { pageNumber } : {}) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Comparison failed');
      setMessage({
        kind: 'success',
        text: `Compared ${data.reconciled} page(s); ${data.pagesWithHolds} with disagreements.${data.skippedSingleReading ? ` ${data.skippedSingleReading} skipped (only one reading).` : ''}`,
      });
      await loadAgreement(runId);
    } catch (e) {
      setMessage({ kind: 'error', text: e instanceof Error ? e.message : 'Comparison failed' });
    } finally {
      setBusy(null);
    }
  };

  // One explicit page, one provider at a time -- the same guard the Book
  // Library uses. Running does spend provider credits; nothing here runs
  // unless one of these buttons is pressed.
  const runBenchmark = async (providers: Provider[]) => {
    const pageNumber = requestedPage();
    if (!endpoint || !runId || !pageNumber) {
      setMessage({ kind: 'error', text: 'Enter the page number to benchmark first.' });
      return;
    }
    setBusy(`bench:${providers.join('+')}`);
    setMessage(null);
    const done: string[] = [];
    try {
      for (const provider of providers) {
        const res = await fetch(`${endpoint}/benchmarks`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ provider, pageNumber }) });
        const data = await res.json();
        if (res.status === 409 && data.benchmarkId) { done.push(`${PROVIDER_LABEL[provider]} (already had a result)`); continue; }
        if (!res.ok) throw new Error(`${PROVIDER_LABEL[provider]}: ${data.error || 'benchmark failed'}`);
        done.push(`${PROVIDER_LABEL[provider]} (${data.benchmark.latencyMs} ms)`);
      }
      setMessage({ kind: 'success', text: `Page ${pageNumber}: ${done.join(' and ')}. Press Compare to check agreement.` });
      await loadAgreement(runId);
    } catch (e) {
      const prefix = done.length ? `Completed ${done.join(', ')}. ` : '';
      setMessage({ kind: 'error', text: prefix + (e instanceof Error ? e.message : 'Benchmark failed') });
    } finally {
      setBusy(null);
    }
  };

  const review = async (pageNumber: number, action: 'MARK_REVIEWED' | 'REOPEN') => {
    if (!endpoint || !runId) return;
    setBusy(`review:${pageNumber}`);
    setMessage(null);
    try {
      const res = await fetch(`${endpoint}/reconcile`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ pageNumber, action, note: notes[pageNumber] || undefined }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not save the review');
      await loadAgreement(runId);
    } catch (e) {
      setMessage({ kind: 'error', text: e instanceof Error ? e.message : 'Could not save the review' });
    } finally {
      setBusy(null);
    }
  };

  const visible = pages.filter((page) => page.status === view);
  const nothingToCompare = coverage !== null && coverage.ready === 0;

  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <Link href="/admin/question-bank/books" className="mb-3 inline-flex items-center gap-2 text-sm font-bold text-indigo-600 dark:text-brand">
        <ArrowLeft className="h-4 w-4" /> Book Ingestion Library
      </Link>

      <header className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-black text-slate-900 dark:text-white">Provider Agreement</h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{book ? <>{book.title} · {book.className}</> : 'Loading…'}</p>
          <p className="mt-1 max-w-2xl text-xs font-bold text-slate-400 dark:text-slate-500">
            Compares what Mathpix and Gemini each read from the same page. A formula they disagree on holds its question for a human. Comparing is free and uses only readings that already exist.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button onClick={() => void load()} disabled={loading || busy !== null} className={secondaryButton}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCcw className="h-4 w-4" />} Refresh
          </button>
          <button onClick={() => void compare()} disabled={busy !== null || loading || !coverage || coverage.ready === 0}
            className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-br from-indigo-600 to-violet-600 px-4 py-2.5 text-sm font-black text-white hover:opacity-90 disabled:opacity-50 dark:from-brand dark:to-brand-violet">
            {busy === 'compare:all' ? <Loader2 className="h-4 w-4 animate-spin" /> : <GitCompareArrows className="h-4 w-4" />} Compare ready pages
          </button>
        </div>
      </header>

      {message && (
        <div className={`mb-4 rounded-xl border px-4 py-3 text-sm font-bold ${
          message.kind === 'success' ? 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-400'
          : message.kind === 'error' ? 'border-rose-200 bg-rose-50 text-rose-800 dark:border-rose-500/20 dark:bg-rose-500/10 dark:text-rose-400'
          : 'border-indigo-200 bg-indigo-50 text-indigo-800 dark:border-brand/20 dark:bg-brand/10 dark:text-brand'
        }`}>{message.text}</div>
      )}

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</div>
      ) : !runId ? (
        <div className={`${card} text-sm text-slate-600 dark:text-slate-300`}>This book has no ingestion run yet. Upload and render its pages first.</div>
      ) : (
        <>
          {coverage && (
            <section className="mb-5">
              <h2 className="mb-2 text-xs font-black uppercase tracking-wide text-slate-400 dark:text-slate-500">What exists today</h2>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
                {([
                  ['Pages', coverage.totalPages, 'text-slate-900 dark:text-white'],
                  ['Both readings — ready', coverage.ready, 'text-emerald-600 dark:text-emerald-400'],
                  ['Mathpix only', coverage.mathpixOnly, 'text-slate-900 dark:text-white'],
                  ['Gemini only', coverage.geminiOnly, 'text-slate-900 dark:text-white'],
                  ['No reading', coverage.noReading, 'text-slate-400 dark:text-slate-500'],
                ] as const).map(([label, value, tone]) => (
                  <div key={label} className={card}>
                    <div className="text-[11px] font-black uppercase tracking-wide text-slate-400 dark:text-slate-500">{label}</div>
                    <div className={`text-lg font-black ${tone}`}>{value}</div>
                  </div>
                ))}
              </div>
              {nothingToCompare && (
                <p className="mt-3 rounded-xl border border-indigo-200 bg-indigo-50 px-4 py-3 text-sm text-indigo-900 dark:border-brand/20 dark:bg-brand/10 dark:text-brand">
                  No page has both a Mathpix and a Gemini reading yet, so there is nothing to compare. A page becomes comparable once it has a Gemini result alongside Mathpix text (a Mathpix benchmark, or the OCR text the book extraction already stored). Use the benchmark panel below to add the missing reading for a page you care about.
                </p>
              )}
            </section>
          )}

          <section className={`${card} mb-5 px-4 py-4`}>
            <h2 className="mb-1 text-sm font-black text-slate-900 dark:text-white">Run a benchmark on one page</h2>
            <p className="mb-3 text-xs text-slate-500 dark:text-slate-400">
              One page, one explicit press. Each provider call spends credits and is never run automatically. A provider that already has a result for the page is not re-run.
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <label className="text-xs font-black text-slate-500 dark:text-slate-400" htmlFor="benchmark-page">Page</label>
              <input id="benchmark-page" inputMode="numeric" value={pageInput} onChange={(event) => setPageInput(event.target.value.replace(/\D/g, ''))} placeholder="e.g. 42"
                className="w-24 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-bold text-slate-900 dark:bg-surface dark:border-white/10 dark:text-white" />
              <button onClick={() => void runBenchmark(['GEMINI_VISION'])} disabled={busy !== null || !requestedPage()}
                className="inline-flex items-center gap-2 rounded-xl border border-violet-200 bg-violet-50 px-3 py-2 text-xs font-black text-violet-700 disabled:opacity-60 dark:text-brand-violet dark:bg-brand-violet/10">
                {busy === 'bench:GEMINI_VISION' && <Loader2 className="h-3.5 w-3.5 animate-spin" />}Benchmark Gemini
              </button>
              <button onClick={() => void runBenchmark(['MATHPIX_OCR'])} disabled={busy !== null || !requestedPage()}
                className="inline-flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-black text-emerald-700 disabled:opacity-60 dark:text-emerald-400 dark:bg-emerald-500/10 dark:border-emerald-500/20">
                {busy === 'bench:MATHPIX_OCR' && <Loader2 className="h-3.5 w-3.5 animate-spin" />}Benchmark Mathpix
              </button>
              <button onClick={() => void runBenchmark(['GEMINI_VISION', 'MATHPIX_OCR'])} disabled={busy !== null || !requestedPage()} className={`${secondaryButton} !px-3 !py-2 !text-xs`}>
                {busy === 'bench:GEMINI_VISION+MATHPIX_OCR' && <Loader2 className="h-3.5 w-3.5 animate-spin" />}Benchmark both
              </button>
              <button onClick={() => { const n = requestedPage(); if (n) void compare(n); }} disabled={busy !== null || !requestedPage()} className={`${secondaryButton} !px-3 !py-2 !text-xs`}>
                {busy === `compare:${requestedPage()}` && <Loader2 className="h-3.5 w-3.5 animate-spin" />}Compare this page
              </button>
            </div>
          </section>

          {summary && (
            <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-5">
              {([
                ['Compared pages', summary.reconciledPages],
                ['Agree', summary.clean],
                ['Disagree', summary.hasHolds],
                ['Reviewed', summary.reviewed],
                ['Formulas disputed', summary.heldBlocks],
              ] as const).map(([label, value]) => (
                <div key={label} className={card}>
                  <div className="text-[11px] font-black uppercase tracking-wide text-slate-400 dark:text-slate-500">{label}</div>
                  <div className={`text-lg font-black ${label === 'Disagree' && value > 0 ? 'text-rose-600 dark:text-rose-400' : 'text-slate-900 dark:text-white'}`}>{value}</div>
                </div>
              ))}
            </div>
          )}

          <div className="mb-3 flex gap-2">
            {(['HAS_HOLDS', 'REVIEWED'] as const).map((tab) => (
              <button key={tab} onClick={() => setView(tab)}
                className={`rounded-xl px-3 py-1.5 text-xs font-black ${view === tab ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900' : 'border border-slate-300 text-slate-600 dark:border-white/10 dark:text-slate-300'}`}>
                {tab === 'HAS_HOLDS' ? `Needs review (${pages.filter((p) => p.status === 'HAS_HOLDS').length})` : `Reviewed (${pages.filter((p) => p.status === 'REVIEWED').length})`}
              </button>
            ))}
          </div>

          {visible.length === 0 ? (
            <div className={`${card} text-sm text-slate-500 dark:text-slate-400`}>
              {view === 'HAS_HOLDS' ? 'No page has a formula the two providers disagree on.' : 'No page has been marked reviewed.'}
            </div>
          ) : (
            <ul className="space-y-3">
              {visible.map((page) => {
                const open = expanded === page.pageNumber;
                return (
                  <li key={page.pageNumber} className="rounded-xl border border-slate-200 bg-white dark:bg-surface dark:border-white/10">
                    <button onClick={() => setExpanded(open ? null : page.pageNumber)} className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left">
                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                        <span className="text-sm font-black text-slate-900 dark:text-white">Page {page.pageNumber}</span>
                        <span className="inline-flex items-center gap-1 text-xs font-bold text-rose-600 dark:text-rose-400"><AlertTriangle className="h-3.5 w-3.5" /> {page.heldBlocks} disputed formula{page.heldBlocks === 1 ? '' : 's'}</span>
                        <span className="text-xs text-slate-500 dark:text-slate-400">{page.agreementBlocks} agree</span>
                        {page.heldPrintedNumbers.length > 0 && <span className="text-xs text-slate-500 dark:text-slate-400">Questions: {page.heldPrintedNumbers.join(', ')}</span>}
                        {page.status === 'REVIEWED' && <span className="inline-flex items-center gap-1 text-xs font-bold text-emerald-600 dark:text-emerald-400"><CheckCircle2 className="h-3.5 w-3.5" /> Reviewed</span>}
                      </div>
                      {open ? <ChevronUp className="h-4 w-4 shrink-0" /> : <ChevronDown className="h-4 w-4 shrink-0" />}
                    </button>
                    {open && (
                      <div className="grid gap-4 border-t border-slate-100 px-4 py-4 dark:border-white/10 lg:grid-cols-2">
                        <div>
                          <p className="mb-2 text-xs text-slate-500 dark:text-slate-400">
                            {page.pairing ? <>Mathpix {page.pairing.primaryOrigin === 'BENCHMARK' ? 'benchmark' : 'extraction text'} compared with Gemini.</> : 'Mathpix compared with Gemini.'}
                          </p>
                          <ul className="space-y-2">
                            {page.heldBlockDetails.map((block) => (
                              <li key={block.blockIndex} className="rounded-lg border border-rose-100 bg-rose-50/60 px-3 py-2 text-xs dark:border-rose-500/20 dark:bg-rose-500/10">
                                <div className="mb-1 font-mono text-[12px] text-slate-800 dark:text-slate-100">{block.preview}</div>
                                <div className="text-slate-500 dark:text-slate-400">
                                  Similarity {Math.round(block.similarity * 100)}%{block.critical ? ' · an operator or exponent differs' : ''}
                                </div>
                                {block.blockOnlyTokens.length > 0 && <div className="text-slate-500 dark:text-slate-400">Only in Mathpix: <span className="font-mono">{block.blockOnlyTokens.join(' ')}</span></div>}
                                {block.candidateOnlyTokens.length > 0 && <div className="text-slate-500 dark:text-slate-400">Only in Gemini: <span className="font-mono">{block.candidateOnlyTokens.join(' ')}</span></div>}
                              </li>
                            ))}
                          </ul>
                          <div className="mt-3 flex flex-wrap items-center gap-2">
                            {page.status === 'HAS_HOLDS' ? (
                              <>
                                <input aria-label={`Review note for page ${page.pageNumber}`} value={notes[page.pageNumber] ?? ''} onChange={(event) => setNotes((prev) => ({ ...prev, [page.pageNumber]: event.target.value }))}
                                  placeholder="Note (optional)" className="min-w-40 flex-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs dark:bg-surface dark:border-white/10 dark:text-white" />
                                <button onClick={() => void review(page.pageNumber, 'MARK_REVIEWED')} disabled={busy !== null}
                                  className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-3 py-2 text-xs font-black text-white hover:bg-emerald-700 disabled:opacity-50">
                                  {busy === `review:${page.pageNumber}` ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />} I checked the page — mark reviewed
                                </button>
                              </>
                            ) : (
                              <>
                                {page.resolution?.note && <span className="text-xs text-slate-500 dark:text-slate-400">Note: {page.resolution.note}</span>}
                                <button onClick={() => void review(page.pageNumber, 'REOPEN')} disabled={busy !== null} className={`${secondaryButton} !px-3 !py-2 !text-xs`}>
                                  <Undo2 className="h-3.5 w-3.5" /> Reopen
                                </button>
                              </>
                            )}
                            <button onClick={() => void compare(page.pageNumber)} disabled={busy !== null} className={`${secondaryButton} !px-3 !py-2 !text-xs`}>
                              <RefreshCcw className="h-3.5 w-3.5" /> Re-compare
                            </button>
                          </div>
                        </div>
                        <div>
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={`/api/admin/books/${bookId}/pages/${page.pageNumber}/image`} alt={`Source page ${page.pageNumber}`} className="max-h-[32rem] w-full rounded-lg border border-slate-200 bg-slate-50 object-contain dark:border-white/10 dark:bg-surface-muted" />
                        </div>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </>
      )}
    </main>
  );
}
