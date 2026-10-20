'use client';

import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, ArrowDownToLine, ArrowUpFromLine, CheckCircle2, Clock, Eye, Loader2, Lock, Send, ShieldAlert } from 'lucide-react';
import { toast } from 'react-hot-toast';

type Action = 'in-sync' | 'promote' | 'replicate' | 'delete-live' | 'delete-staging' | 'conflict' | 'held' | 'blocked' | 'kept' | 'excluded' | 'forget';
interface Issue { table: string; id: string; action: Action; reason?: string }
interface Report {
  runId: string;
  applied: boolean;
  totals: Partial<Record<Action, number>>;
  tables: Record<string, Partial<Record<Action, number>>>;
  written: { live: number; staging: number; seeded: number };
  issues: Issue[];
  issuesTruncated: boolean;
}
interface Run { id: string; startedAt: string; mode: string; triggeredBy: string; status: string; summary: { written?: { live: number; staging: number } } | null; error: string | null }
interface Status { role: 'live' | 'staging'; ready: boolean; reason: string | null; runs: Run[] }

const ISSUE_TABS: Array<{ action: Action; label: string; hint: string }> = [
  { action: 'conflict', label: 'Conflicts', hint: 'Changed on both sites since the last sync. Neither is overwritten until you choose.' },
  { action: 'blocked', label: 'Blocked', hint: 'Approved, but something it needs (an author account, a book) cannot go live.' },
  { action: 'held', label: 'Waiting for approval', hint: 'Changed in staging but not approved yet, or not needed by anything approved.' },
];

const n = (value: number | undefined) => value ?? 0;

export default function ContentSyncClient() {
  const [status, setStatus] = useState<Status | null>(null);
  const [report, setReport] = useState<Report | null>(null);
  const [busy, setBusy] = useState<'preview' | 'publish' | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [tab, setTab] = useState<Action>('conflict');
  const [resolving, setResolving] = useState<string | null>(null);

  const loadStatus = useCallback(async () => {
    const res = await fetch('/api/admin/content-sync');
    if (res.ok) setStatus(await res.json());
  }, []);
  useEffect(() => { loadStatus(); }, [loadStatus]);

  const run = async (apply: boolean) => {
    setBusy(apply ? 'publish' : 'preview');
    setConfirming(false);
    try {
      const res = await fetch('/api/admin/content-sync', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ apply }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'The sync failed');
      setReport(data);
      const first = ISSUE_TABS.find((t) => n(data.totals[t.action]) > 0);
      if (first) setTab(first.action);
      if (apply) toast.success(`Published: ${data.written.live} written to live, ${data.written.staging} copied down`);
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setBusy(null);
      loadStatus();
    }
  };

  const resolve = async (issue: Issue, keep: 'staging' | 'live') => {
    setResolving(`${issue.table}:${issue.id}`);
    try {
      const res = await fetch('/api/admin/content-sync/resolve', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ table: issue.table, id: issue.id, keep }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not settle it');
      toast.success(keep === 'staging' ? 'Kept the staging version' : 'Kept the live version');
      setReport((r) => r && { ...r, issues: r.issues.filter((i) => !(i.table === issue.table && i.id === issue.id)), totals: { ...r.totals, conflict: Math.max(0, n(r.totals.conflict) - 1) } });
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setResolving(null);
    }
  };

  if (!status) {
    return <div className="flex items-center gap-2 p-10 text-slate-500"><Loader2 className="h-5 w-5 animate-spin" /> Loading…</div>;
  }

  const toPublish = report ? n(report.totals.promote) + n(report.totals['delete-live']) : 0;
  const toCopyDown = report ? n(report.totals.replicate) + n(report.totals['delete-staging']) : 0;
  const canPublish = !!report && !report.applied && (toPublish > 0 || toCopyDown > 0);
  const issues = report?.issues.filter((i) => i.action === tab) ?? [];

  return (
    <div className="mx-auto max-w-6xl space-y-8 px-6 py-8">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-black text-slate-900 dark:text-white">Publish to live</h1>
          <p className="mt-1 max-w-2xl text-sm text-slate-500 dark:text-slate-400">
            Questions are imported, corrected and approved here in staging. Publishing copies approved changes to the live site, and brings
            what changed on the live site (teachers&apos; questions, students&apos; reports) back down.
          </p>
        </div>
        <span data-testid="content-role" className={`rounded-full px-3 py-1 text-xs font-black uppercase tracking-widest ${status.role === 'staging' ? 'bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300' : 'bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300'}`}>
          {status.role === 'staging' ? 'Staging site' : 'Live site'}
        </span>
      </header>

      {!status.ready ? (
        <section data-testid="sync-not-ready" className="flex gap-4 rounded-2xl border border-slate-200 bg-white p-6 dark:border-white/10 dark:bg-surface">
          <Lock className="mt-0.5 h-5 w-5 shrink-0 text-slate-400" />
          <div className="space-y-2 text-sm text-slate-700 dark:text-slate-300">
            <p className="font-bold text-slate-900 dark:text-white">{status.reason}</p>
            {status.role === 'live' && (
              <p>
                To import, extract or approve questions, open the staging site. On this computer, start it with{' '}
                <code className="rounded bg-slate-100 px-1.5 py-0.5 text-xs dark:bg-white/10">npm run dev:staging</code> and go to{' '}
                <code className="rounded bg-slate-100 px-1.5 py-0.5 text-xs dark:bg-white/10">http://localhost:3200/admin/content-sync</code>.
              </p>
            )}
          </div>
        </section>
      ) : (
        <section className="space-y-6">
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              data-testid="sync-preview"
              onClick={() => run(false)}
              disabled={busy !== null}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-bold text-slate-800 hover:bg-slate-50 disabled:opacity-50 dark:border-white/15 dark:bg-white/5 dark:text-white"
            >
              {busy === 'preview' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Eye className="h-4 w-4" />} Preview changes
            </button>
            <button
              type="button"
              data-testid="sync-publish"
              onClick={() => setConfirming(true)}
              disabled={!canPublish || busy !== null}
              className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-br from-indigo-600 to-violet-600 px-4 py-2.5 text-sm font-bold text-white shadow-sm hover:opacity-90 disabled:opacity-40 dark:from-brand dark:to-brand-violet"
            >
              {busy === 'publish' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} Publish to live
            </button>
            {!report && <span className="text-sm text-slate-500 dark:text-slate-400">Preview first: nothing is written until you publish.</span>}
          </div>

          {confirming && report && (
            <div role="alertdialog" aria-labelledby="confirm-publish-title" data-testid="sync-confirm" className="rounded-2xl border border-indigo-200 bg-indigo-50 p-5 dark:border-brand/30 dark:bg-brand/10">
              <p id="confirm-publish-title" className="font-bold text-slate-900 dark:text-white">
                Publish {toPublish} change{toPublish === 1 ? '' : 's'} to the live site and copy {toCopyDown} down to staging?
              </p>
              <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">Students see published questions straight away. Every row replaced is kept in this run&apos;s record.</p>
              <div className="mt-4 flex gap-3">
                <button type="button" data-testid="sync-confirm-publish" onClick={() => run(true)} className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-bold text-white hover:bg-indigo-500 dark:bg-brand">Publish now</button>
                <button type="button" onClick={() => setConfirming(false)} className="rounded-xl px-4 py-2 text-sm font-bold text-slate-700 hover:bg-white/60 dark:text-slate-300">Cancel</button>
              </div>
            </div>
          )}

          {report && (
            <div className="space-y-6" data-testid="sync-report">
              {report.applied && (
                <p role="status" className="flex items-center gap-2 rounded-xl bg-emerald-50 px-4 py-3 text-sm font-bold text-emerald-800 dark:bg-emerald-500/10 dark:text-emerald-300">
                  <CheckCircle2 className="h-4 w-4" /> Published: {report.written.live} written to live, {report.written.staging} copied down to staging.
                </p>
              )}
              <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
                {[
                  { label: report.applied ? 'Published' : 'To publish', value: toPublish, icon: ArrowUpFromLine },
                  { label: report.applied ? 'Copied down' : 'To copy down', value: toCopyDown, icon: ArrowDownToLine },
                  { label: 'Conflicts', value: n(report.totals.conflict), icon: AlertTriangle },
                  { label: 'Blocked', value: n(report.totals.blocked), icon: ShieldAlert },
                  { label: 'Waiting for approval', value: n(report.totals.held), icon: Clock },
                  { label: 'Already in sync', value: n(report.totals['in-sync']), icon: CheckCircle2 },
                ].map(({ label, value, icon: Icon }) => (
                  <div key={label} className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-white/10 dark:bg-surface">
                    <dt className="flex items-center gap-1.5 text-[11px] font-black uppercase tracking-wider text-slate-500 dark:text-slate-400"><Icon className="h-3.5 w-3.5" /> {label}</dt>
                    <dd className="mt-1 text-2xl font-black tabular-nums text-slate-900 dark:text-white">{value.toLocaleString('en-IN')}</dd>
                  </div>
                ))}
              </dl>

              <div className="rounded-2xl border border-slate-200 bg-white dark:border-white/10 dark:bg-surface">
                <div role="tablist" aria-label="Items that need attention" className="flex flex-wrap gap-1 border-b border-slate-200 p-2 dark:border-white/10">
                  {ISSUE_TABS.map((t) => (
                    <button
                      key={t.action}
                      role="tab"
                      type="button"
                      aria-selected={tab === t.action}
                      onClick={() => setTab(t.action)}
                      className={`rounded-lg px-3 py-1.5 text-sm font-bold ${tab === t.action ? 'bg-slate-900 text-white dark:bg-white/15' : 'text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-white/5'}`}
                    >
                      {t.label} <span className="tabular-nums opacity-70">{n(report.totals[t.action])}</span>
                    </button>
                  ))}
                </div>
                <p className="px-5 pt-4 text-xs text-slate-500 dark:text-slate-400">{ISSUE_TABS.find((t) => t.action === tab)?.hint}</p>
                {issues.length === 0 ? (
                  <p className="px-5 py-6 text-sm text-slate-500 dark:text-slate-400">Nothing here.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-left text-[11px] font-black uppercase tracking-wider text-slate-500 dark:text-slate-400">
                          <th scope="col" className="px-5 py-3">Item</th>
                          <th scope="col" className="px-5 py-3">Why</th>
                          {tab === 'conflict' && <th scope="col" className="px-5 py-3 text-right">Keep</th>}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-white/5">
                        {issues.map((issue) => {
                          const key = `${issue.table}:${issue.id}`;
                          return (
                            <tr key={key} data-testid={`sync-issue-${issue.table}-${issue.id}`}>
                              <td className="px-5 py-3 align-top">
                                <span className="font-bold text-slate-900 dark:text-white">{issue.table}</span>
                                <span className="ml-2 font-mono text-xs text-slate-500 dark:text-slate-400">{issue.id}</span>
                              </td>
                              <td className="px-5 py-3 text-slate-700 dark:text-slate-300">{issue.reason}</td>
                              {tab === 'conflict' && (
                                <td className="whitespace-nowrap px-5 py-3 text-right">
                                  {resolving === key ? <Loader2 className="ml-auto h-4 w-4 animate-spin" /> : (
                                    <span className="inline-flex gap-2">
                                      <button type="button" onClick={() => resolve(issue, 'staging')} className="rounded-lg border border-slate-300 px-2.5 py-1 text-xs font-bold hover:bg-slate-50 dark:border-white/15 dark:hover:bg-white/5">Staging version</button>
                                      <button type="button" onClick={() => resolve(issue, 'live')} className="rounded-lg border border-slate-300 px-2.5 py-1 text-xs font-bold hover:bg-slate-50 dark:border-white/15 dark:hover:bg-white/5">Live version</button>
                                    </span>
                                  )}
                                </td>
                              )}
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                    {report.issuesTruncated && <p className="px-5 py-3 text-xs text-slate-500">Showing the first 500. The full list is in the run record.</p>}
                  </div>
                )}
              </div>
            </div>
          )}
        </section>
      )}

      {status.runs.length > 0 && (
        <section>
          <h2 className="mb-3 font-display text-lg font-black text-slate-900 dark:text-white">Recent runs</h2>
          <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white dark:border-white/10 dark:bg-surface">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[11px] font-black uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  <th scope="col" className="px-5 py-3">When</th>
                  <th scope="col" className="px-5 py-3">What</th>
                  <th scope="col" className="px-5 py-3">By</th>
                  <th scope="col" className="px-5 py-3">Result</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-white/5">
                {status.runs.map((r) => (
                  <tr key={r.id}>
                    <td className="whitespace-nowrap px-5 py-3 tabular-nums text-slate-700 dark:text-slate-300">{new Date(r.startedAt).toLocaleString('en-IN')}</td>
                    <td className="px-5 py-3 text-slate-900 dark:text-white">{r.mode === 'APPLY' ? 'Publish' : r.mode === 'DRY_RUN' ? 'Preview' : r.mode === 'RESOLVE' ? 'Conflict settled' : r.mode}</td>
                    <td className="px-5 py-3 text-slate-600 dark:text-slate-400">{r.triggeredBy}</td>
                    <td className="px-5 py-3 text-slate-700 dark:text-slate-300">
                      {r.status === 'FAILED' ? <span className="text-rose-600 dark:text-rose-400">Failed: {r.error}</span>
                        : r.status === 'RUNNING' ? 'Running'
                        : r.mode === 'APPLY' && r.summary?.written ? `${r.summary.written.live} to live, ${r.summary.written.staging} down` : 'Done'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}
