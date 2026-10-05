'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, ArrowLeft, CheckCircle2, CircleDashed, Loader2, Save, XCircle } from 'lucide-react';
import type { ProviderPilotReport, PilotRun } from '@/lib/provider-pilot-data';

type Criterion = ProviderPilotReport['gate']['criteria'][number];

const PROVIDER_LABEL: Record<string, string> = { GEMINI_VISION: 'Gemini', MATHPIX_OCR: 'Mathpix', MISTRAL_OCR: 'Mistral', OPENAI_VISION: 'OpenAI' };
const providerName = (provider: string) => PROVIDER_LABEL[provider] ?? provider;
const profileName = (profile: string) => profile.replaceAll('_', ' ').toLowerCase().replace(/^./, c => c.toUpperCase());
const percent = (value: number | null) => (value === null ? '—' : `${Math.round(value * 1000) / 10}%`);
const seconds = (ms: number | null) => (ms === null ? '—' : `${(ms / 1000).toFixed(1)} s`);

const STATUS: Record<Criterion['status'], { label: string; className: string; Icon: typeof CheckCircle2 }> = {
  MET: { label: 'Met', className: 'text-emerald-700 bg-emerald-50', Icon: CheckCircle2 },
  NOT_MET: { label: 'Not met', className: 'text-red-700 bg-red-50', Icon: XCircle },
  NOT_MEASURED: { label: 'Not measured', className: 'text-slate-600 bg-slate-100', Icon: CircleDashed },
};

export default function ProviderPilotClient() {
  const [report, setReport] = useState<ProviderPilotReport | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const response = await fetch('/api/admin/provider-pilot');
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Could not load the provider pilot');
      setReport(data);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load the provider pilot');
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  if (error) return <p className="m-6 rounded-xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-700">{error}</p>;
  if (!report) return <div className="flex h-64 items-center justify-center text-sm text-slate-400"><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading the evidence…</div>;

  const { gate, coverage, summaries, thresholds } = report;
  const ready = gate.verdict === 'READY_TO_DECIDE';

  return (
    <div className="mx-auto max-w-6xl space-y-8 p-4 sm:p-6">
      <Link href="/admin/question-bank/books" className="inline-flex items-center gap-2 text-sm font-bold text-slate-500 hover:text-slate-800 dark:text-slate-400"><ArrowLeft className="h-4 w-4" /> Book Library</Link>
      <div>
        <h1 className="font-display text-2xl font-black text-slate-900 dark:text-white">Provider pilot</h1>
        <p className="mt-1 max-w-3xl text-sm text-slate-500 dark:text-slate-400">
          Which paid provider to commit to, decided from what has been measured on a representative Class 11 and Class 12 sample, not from a single page. This screen reads existing results and spends nothing.
        </p>
      </div>

      <section className={`rounded-2xl border p-5 ${ready ? 'border-emerald-200 bg-emerald-50' : 'border-amber-200 bg-amber-50'}`} aria-labelledby="verdict">
        <div className="flex items-start gap-3">
          {ready ? <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-700" /> : <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-700" />}
          <div>
            <h2 id="verdict" className="text-sm font-black uppercase tracking-widest text-slate-700">{ready ? 'Ready to decide' : 'Not ready to decide'}</h2>
            <p className="mt-1 text-sm text-slate-800">{gate.statement}</p>
          </div>
        </div>
      </section>

      <section>
        <h2 className="mb-3 font-display text-lg font-black text-slate-900 dark:text-white">The purchase gate</h2>
        <ul className="divide-y divide-slate-200 overflow-hidden rounded-2xl border border-slate-200 bg-white dark:divide-white/10 dark:border-white/10 dark:bg-surface">
          {gate.criteria.map((criterion) => {
            const { label, className, Icon } = STATUS[criterion.status];
            return (
              <li key={criterion.id} className="flex flex-wrap items-start gap-x-4 gap-y-1 p-4">
                <span className={`inline-flex w-32 shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-black ${className}`}><Icon className="h-3.5 w-3.5" /> {label}</span>
                <div className="min-w-[16rem] flex-1">
                  <p className="text-sm font-black text-slate-900 dark:text-white">{criterion.label}</p>
                  <p className="mt-0.5 text-xs text-slate-500">{criterion.detail}</p>
                </div>
              </li>
            );
          })}
        </ul>
        <p className="mt-2 text-[11px] text-slate-400">
          Thresholds are proposals, not measurements: {percent(thresholds.completionRate)} completion, {percent(thresholds.questionRecall)} question recall, {percent(thresholds.formulaAgreement)} formula agreement, {thresholds.minPagesPerProfile} pages per profile, {thresholds.minPagesPerClass} per class, {thresholds.minReviewedQuestions} reviewed questions. They live in <code>lib/provider-pilot.ts</code>.
        </p>
      </section>

      <section>
        <h2 className="mb-3 font-display text-lg font-black text-slate-900 dark:text-white">How much of the sample is covered</h2>
        <div className="grid gap-4 md:grid-cols-2">
          <CoverageList title="Source profiles" rows={coverage.profiles.map(p => ({ key: p.profile, label: profileName(p.profile), pages: p.pages, met: p.met, byProvider: p.byProvider }))} target={thresholds.minPagesPerProfile} />
          <CoverageList title="Classes" rows={coverage.classes.map(c => ({ key: c.className, label: c.className, pages: c.pages, met: c.met, byProvider: c.byProvider }))} target={thresholds.minPagesPerClass} note="Class comes from the book a page belongs to, so only benchmarks run inside the app count; the earlier pilot files record no class." />
        </div>
      </section>

      <section>
        <h2 className="mb-3 font-display text-lg font-black text-slate-900 dark:text-white">What each provider has done so far</h2>
        <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white dark:border-white/10 dark:bg-surface">
          <table className="w-full min-w-[40rem] text-left text-sm">
            <thead className="text-[10px] font-black uppercase tracking-widest text-slate-400">
              <tr><th className="p-3">Provider</th><th className="p-3">Pages</th><th className="p-3">Completed</th><th className="p-3">Question recall</th><th className="p-3">Extra markers</th><th className="p-3">Median / slowest 10%</th></tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-white/5">
              {summaries.map((s) => (
                <tr key={s.provider}>
                  <td className="p-3 font-black text-slate-900 dark:text-white">{providerName(s.provider)}</td>
                  <td className="p-3 tabular-nums">{s.attempted}{s.unavailable ? <span className="text-slate-400"> ({s.unavailable} unavailable)</span> : null}</td>
                  <td className="p-3 tabular-nums">{percent(s.completionRate)}</td>
                  <td className="p-3 tabular-nums">{s.recall ? <>{percent(s.recall.rate)} <span className="text-slate-400">({s.recall.matched}/{s.recall.expected})</span></> : '—'}</td>
                  <td className="p-3 tabular-nums">{percent(s.overDetectionRate)}</td>
                  <td className="p-3 tabular-nums">{seconds(s.medianLatencyMs)} / {seconds(s.p90LatencyMs)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-[11px] text-slate-400">
          Recall is measured against the PDF&apos;s own question markers on born-digital pages (or a hand count on the four-page pilot), capped per page, so it is a proxy and not a mark against the printed page. A provider that ran out of credit is counted as unavailable, not as failing.
          {' '}Evidence: {report.evidence.databaseObservations} benchmark{report.evidence.databaseObservations === 1 ? '' : 's'} run in the app and {report.evidence.fileObservations} from the earlier pilot files.
        </p>
      </section>

      <section>
        <h2 className="mb-1 font-display text-lg font-black text-slate-900 dark:text-white">Review time and cost</h2>
        <p className="mb-3 max-w-3xl text-xs text-slate-500">
          Only a person can time a review or know what was spent. Record both for each pilot run; the gate turns them into minutes per 100 questions and cost per verified question. Cost is divided only by the verified questions of runs whose spend you recorded.
        </p>
        <MeasurementTable runs={report.runs} onSaved={load} />
      </section>
    </div>
  );
}

function CoverageList({ title, rows, target, note }: { title: string; rows: Array<{ key: string; label: string; pages: number; met: boolean; byProvider: Record<string, number> }>; target: number; note?: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-white/10 dark:bg-surface">
      <h3 className="mb-3 text-[10px] font-black uppercase tracking-widest text-slate-400">{title}</h3>
      <ul className="space-y-3">
        {rows.map((row) => (
          <li key={row.key}>
            <div className="flex items-baseline justify-between text-sm">
              <span className="font-bold text-slate-900 dark:text-white">{row.label}</span>
              <span className={`tabular-nums text-xs font-black ${row.met ? 'text-emerald-700' : 'text-slate-500'}`}>{row.pages} / {target} pages</span>
            </div>
            <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-100" role="progressbar" aria-valuenow={Math.min(row.pages, target)} aria-valuemin={0} aria-valuemax={target} aria-label={`${row.label} coverage`}>
              <div className={`h-full rounded-full ${row.met ? 'bg-emerald-500' : 'bg-indigo-400'}`} style={{ width: `${Math.min(100, (row.pages / target) * 100)}%` }} />
            </div>
            {Object.keys(row.byProvider).length > 0 && <p className="mt-1 text-[11px] text-slate-400">{Object.entries(row.byProvider).map(([provider, n]) => `${providerName(provider)} ${n}`).join(' · ')}</p>}
          </li>
        ))}
      </ul>
      {note && <p className="mt-3 text-[11px] text-slate-400">{note}</p>}
    </div>
  );
}

function MeasurementTable({ runs, onSaved }: { runs: PilotRun[]; onSaved: () => void }) {
  if (runs.length === 0) return <p className="rounded-xl border border-slate-200 bg-slate-50 p-5 text-sm text-slate-500">No book has been ingested yet.</p>;
  return (
    <ul className="space-y-3">
      {runs.map((run) => <MeasurementRow key={run.runId} run={run} onSaved={onSaved} />)}
    </ul>
  );
}

function MeasurementRow({ run, onSaved }: { run: PilotRun; onSaved: () => void }) {
  const m = run.measurements;
  const [minutes, setMinutes] = useState(m?.reviewMinutes?.toString() ?? '');
  const [reviewed, setReviewed] = useState(m?.reviewedQuestions?.toString() ?? '');
  const [spend, setSpend] = useState(m?.spend?.toString() ?? '');
  const [currency, setCurrency] = useState(m?.currency ?? 'INR');
  const [notes, setNotes] = useState(m?.notes ?? '');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const toNumber = (value: string) => (value.trim() === '' ? null : Number(value));

  async function save() {
    setBusy(true);
    setMessage(null);
    try {
      const response = await fetch(`/api/admin/books/${run.bookId}/ingestions/${run.runId}/pilot-measurements`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reviewMinutes: toNumber(minutes), reviewedQuestions: toNumber(reviewed), spend: toNumber(spend), currency: spend.trim() ? currency : null, notes }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Could not save');
      setMessage({ ok: true, text: 'Saved' });
      onSaved();
    } catch (e) {
      setMessage({ ok: false, text: e instanceof Error ? e.message : 'Could not save' });
    } finally {
      setBusy(false);
    }
  }

  const input = 'w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-sm tabular-nums dark:border-white/10 dark:bg-white/5';
  return (
    <li className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-white/10 dark:bg-surface">
      <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
        <p className="font-black text-slate-900 dark:text-white">{run.bookTitle}</p>
        <p className="text-xs text-slate-400">{run.className}{run.profile ? ` · ${profileName(run.profile)}` : ''}</p>
        <p className="ml-auto text-xs tabular-nums text-slate-500">{run.extractedQuestions} extracted · {run.verifiedQuestions} verified · {run.benchmarkedPages} benchmarked page{run.benchmarkedPages === 1 ? '' : 's'}</p>
      </div>
      <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <label className="text-[11px] font-bold text-slate-500">Review minutes<input type="number" min={0} inputMode="decimal" value={minutes} onChange={(e) => setMinutes(e.target.value)} className={input} /></label>
        <label className="text-[11px] font-bold text-slate-500">Questions reviewed<input type="number" min={0} step={1} inputMode="numeric" value={reviewed} onChange={(e) => setReviewed(e.target.value)} className={input} /></label>
        <label className="text-[11px] font-bold text-slate-500">Spent on this run<input type="number" min={0} inputMode="decimal" value={spend} onChange={(e) => setSpend(e.target.value)} className={input} /></label>
        <label className="text-[11px] font-bold text-slate-500">Currency<input value={currency} maxLength={3} onChange={(e) => setCurrency(e.target.value.toUpperCase())} className={input} /></label>
        <label className="text-[11px] font-bold text-slate-500 sm:col-span-2 lg:col-span-1">Notes<input value={notes} onChange={(e) => setNotes(e.target.value)} className={input} /></label>
      </div>
      <div className="mt-3 flex items-center gap-3">
        <button type="button" disabled={busy} onClick={() => void save()} className="inline-flex items-center gap-2 rounded-xl border border-indigo-300 bg-indigo-50 px-3.5 py-2 text-sm font-black text-indigo-700 hover:bg-indigo-100 disabled:opacity-60">
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Save measurements
        </button>
        {message && <span className={`text-xs font-semibold ${message.ok ? 'text-emerald-700' : 'text-red-700'}`}>{message.text}</span>}
        {m?.updatedAt && !message && <span className="text-[11px] text-slate-400">Last saved {new Date(m.updatedAt).toLocaleDateString()}</span>}
      </div>
    </li>
  );
}
