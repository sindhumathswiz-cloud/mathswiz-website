'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { ArrowLeft, BookOpen, CalendarClock, Loader2, Trash2 } from 'lucide-react';

interface Draft {
  runId: string;
  bookId: string;
  bookTitle: string;
  className: string;
  fileName: string;
  pdfPages: number | null;
  pagesExtracted: number;
  expiresAt: string | null;
  purgedAt: string | null;
  expired: boolean;
  daysRemaining: number | null;
  questionsAwaitingReview: number;
}

const formatDate = (value: string | null) => value ? new Date(value).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : '—';

export default function DraftsClient() {
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [retentionDays, setRetentionDays] = useState(60);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);

  const load = useCallback(async () => {
    try {
      const response = await fetch('/api/admin/book-drafts');
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Could not load drafts');
      setDrafts(data.drafts);
      setRetentionDays(data.retentionDays);
    } catch (e) {
      setMessage({ kind: 'error', text: e instanceof Error ? e.message : 'Could not load drafts' });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const extend = async (draft: Draft) => {
    setBusy(draft.runId);
    try {
      const response = await fetch(`/api/admin/book-drafts/${draft.runId}/extend`, { method: 'POST' });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Could not extend the draft');
      setMessage({ kind: 'success', text: `${draft.bookTitle} will now be kept until ${formatDate(data.expiresAt)}.` });
      await load();
    } catch (e) {
      setMessage({ kind: 'error', text: e instanceof Error ? e.message : 'Could not extend the draft' });
    } finally {
      setBusy(null);
    }
  };

  const expiredCount = drafts.filter((draft) => draft.expired).length;

  const purgeExpired = async () => {
    const due = drafts.filter((draft) => draft.expired);
    const names = due.map((draft) => `• ${draft.bookTitle}`).join('\n');
    if (!window.confirm(`Delete the extracted pages of ${due.length} expired draft${due.length === 1 ? '' : 's'}?\n\n${names}\n\nThe page images, OCR text and text layers are removed. Questions already in the question bank, their figures and the original PDF are kept.`)) return;
    setBusy('purge');
    try {
      const response = await fetch('/api/admin/book-drafts/purge-expired', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Could not delete expired drafts');
      setMessage({ kind: 'success', text: `Deleted ${data.purged.length} expired draft${data.purged.length === 1 ? '' : 's'}.` });
      await load();
    } catch (e) {
      setMessage({ kind: 'error', text: e instanceof Error ? e.message : 'Could not delete expired drafts' });
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="mx-auto max-w-5xl space-y-5 p-4 sm:p-6">
      <Link href="/admin/question-bank/books" className="inline-flex items-center gap-2 text-sm font-bold text-slate-500 hover:text-slate-800 dark:text-slate-400">
        <ArrowLeft className="h-4 w-4" /> Book Library
      </Link>
      <div>
        <h1 className="font-display text-2xl font-black text-slate-900 dark:text-white">Extracted drafts</h1>
        <p className="mt-1 max-w-2xl text-sm text-slate-500 dark:text-slate-400">
          Each extracted book is kept as a draft, under the book&apos;s name, for {retentionDays} days from its latest render or extraction, so questions can be checked against the source pages. After that the page images and extracted text are deleted; questions already saved to the question bank are never touched.
        </p>
      </div>

      {message && <p className={`rounded-xl border p-3 text-sm font-semibold ${message.kind === 'success' ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-red-200 bg-red-50 text-red-700'}`}>{message.text}</p>}

      {expiredCount > 0 && (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          <p className="min-w-[16rem] flex-1">{expiredCount} draft{expiredCount === 1 ? ' is' : 's are'} past the {retentionDays}-day limit and waiting to be deleted by the scheduled clean-up. Use <strong>Keep 60 more days</strong> on any you still need.</p>
          <button type="button" disabled={busy !== null} onClick={() => void purgeExpired()} className="inline-flex items-center gap-2 rounded-lg border border-amber-400 bg-white px-3 py-1.5 text-xs font-black hover:bg-amber-100 disabled:opacity-50">
            {busy === 'purge' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />} Delete expired now
          </button>
        </div>
      )}

      {loading ? (
        <div className="flex h-32 items-center justify-center text-sm text-slate-400"><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading drafts…</div>
      ) : drafts.length === 0 ? (
        <p className="rounded-xl border border-slate-200 bg-slate-50 p-6 text-center text-sm text-slate-500">No books have been extracted yet. Upload a PDF in the Book Library and its pages appear here as a draft.</p>
      ) : (
        <ul className="divide-y divide-slate-200 overflow-hidden rounded-2xl border border-slate-200 bg-white dark:divide-white/10 dark:border-white/10 dark:bg-surface">
          {drafts.map((draft) => {
            const purged = Boolean(draft.purgedAt);
            const soon = !purged && !draft.expired && draft.daysRemaining !== null && draft.daysRemaining <= 14;
            return (
              <li key={draft.runId} className="flex flex-wrap items-center gap-x-6 gap-y-2 p-4">
                <div className="min-w-[14rem] flex-1">
                  <p className="font-black text-slate-900 dark:text-white">{draft.bookTitle}</p>
                  <p className="text-xs text-slate-400">{draft.className} · {draft.fileName}</p>
                </div>
                <div className="text-xs text-slate-500">
                  <p className="tabular-nums">{draft.pagesExtracted} of {draft.pdfPages ?? '?'} pages</p>
                  {draft.questionsAwaitingReview > 0 && <p className="font-semibold text-amber-700">{draft.questionsAwaitingReview} question{draft.questionsAwaitingReview === 1 ? '' : 's'} still awaiting review</p>}
                </div>
                <div className={`flex items-center gap-1.5 text-xs font-bold ${purged ? 'text-slate-400' : draft.expired ? 'text-red-600' : soon ? 'text-amber-700' : 'text-slate-600'}`}>
                  <CalendarClock className="h-4 w-4" />
                  {purged ? `Deleted ${formatDate(draft.purgedAt)}` : draft.expired ? `Expired ${formatDate(draft.expiresAt)}` : `${draft.daysRemaining} day${draft.daysRemaining === 1 ? '' : 's'} left · until ${formatDate(draft.expiresAt)}`}
                </div>
                <div className="flex items-center gap-2">
                  {!purged && (
                    <Link href={`/admin/question-bank/books/${draft.bookId}/source`} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-black text-slate-700 hover:bg-slate-50">
                      <BookOpen className="h-3.5 w-3.5" /> Open source
                    </Link>
                  )}
                  {!purged && (
                    <button type="button" disabled={busy !== null} onClick={() => void extend(draft)} className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-black text-slate-700 hover:bg-slate-50 disabled:opacity-50">
                      {busy === draft.runId ? '…' : `Keep ${retentionDays} more days`}
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
