'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, ArrowLeft, Archive, BookOpen, CheckCircle2, Loader2, Save, Sparkles } from 'lucide-react';
import MathRenderer from '@/components/MathRenderer';
import { KIND_LABEL, REVISION_KINDS, spaceMathBoundaries, type RevisionKind } from '@/lib/revision-content';

interface ChapterRow { id: string; chapterNumber: string | null; name: string; startPage: number | null; endPage: number | null; counts: { DRAFT: number; APPROVED: number; ARCHIVED: number } }
interface Item {
  id: string; kind: RevisionKind; title: string; body: string; sourcePage: number;
  status: 'DRAFT' | 'APPROVED' | 'ARCHIVED'; reviewNotes: string | null; tier: 'EXACT' | 'CLOSE' | 'MISMATCH';
}
type Message = { kind: 'success' | 'error'; text: string };

const TIER: Record<Item['tier'], { label: string; className: string }> = {
  EXACT: { label: 'Matches the page', className: 'bg-emerald-50 text-emerald-700' },
  CLOSE: { label: 'Differs slightly from the page', className: 'bg-amber-50 text-amber-700' },
  MISMATCH: { label: 'Does not match the page', className: 'bg-red-50 text-red-700' },
};
const button = 'inline-flex items-center gap-2 rounded-xl border px-3.5 py-2 text-sm font-black disabled:opacity-60';

export default function RevisionReviewClient({ bookId }: { bookId: string }) {
  const [book, setBook] = useState<{ title: string; className: string } | null>(null);
  const [chapters, setChapters] = useState<ChapterRow[]>([]);
  const [chapterId, setChapterId] = useState<string | null>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [view, setView] = useState<'DRAFT' | 'APPROVED'>('DRAFT');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<Message | null>(null);
  const [edits, setEdits] = useState<Record<string, Partial<Pick<Item, 'title' | 'body' | 'kind'>>>>({});

  const load = useCallback(async (forChapter: string | null) => {
    try {
      const response = await fetch(`/api/admin/books/${bookId}/revision-content${forChapter ? `?chapterId=${forChapter}` : ''}`);
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Could not load revision content');
      setBook(data.book);
      setChapters(data.chapters);
      setItems(data.items);
    } catch (e) {
      setMessage({ kind: 'error', text: e instanceof Error ? e.message : 'Could not load revision content' });
    } finally {
      setLoading(false);
    }
  }, [bookId]);

  useEffect(() => { void load(chapterId); }, [load, chapterId]);

  const chapter = chapters.find((c) => c.id === chapterId) ?? null;
  const shown = items.filter((item) => item.status === view);

  async function extract() {
    if (!chapter) return;
    setBusy('extract');
    setMessage(null);
    let startPage: number | null = null;
    let found = 0, saved = 0, exact = 0, flagged = 0, pages = 0;
    const unreadable: number[] = [];
    try {
      // One batch of pages per request; each calls the language model.
      // eslint-disable-next-line no-constant-condition
      while (true) {
        const response: Response = await fetch(`/api/admin/books/${bookId}/revision-content/extract`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ chapterId: chapter.id, ...(startPage ? { startPage } : {}) }),
        });
        const data: { error?: string; nextStartPage?: number | null; batch?: { found: number; saved: number; EXACT: number; CLOSE: number; MISMATCH: number; pages: number; endPage: number; unreadablePages?: number[] } } = await response.json();
        if (!response.ok) throw new Error(data.error || 'Extraction failed');
        if (!data.batch) break;
        found += data.batch.found; saved += data.batch.saved; exact += data.batch.EXACT; flagged += data.batch.CLOSE + data.batch.MISMATCH; pages += data.batch.pages; unreadable.push(...(data.batch.unreadablePages ?? []));
        setMessage({ kind: 'success', text: `Reading ${chapter.name}: through page ${data.batch.endPage}, ${saved} item${saved === 1 ? '' : 's'} found so far…` });
        if (!data.nextStartPage) break;
        startPage = data.nextStartPage;
      }
      setMessage({ kind: 'success', text: `${chapter.name}: read ${pages} pages and found ${found} item${found === 1 ? '' : 's'} (${saved} new, saved as drafts). ${exact} match the page exactly and ${flagged} need a closer look.${unreadable.length ? ` Pages ${unreadable.join(', ')} could not be read by the model; run it again to retry them.` : ''}` });
      setView('DRAFT');
    } catch (e) {
      setMessage({ kind: 'error', text: `${e instanceof Error ? e.message : 'Extraction failed'} Items saved so far are kept; run it again to continue.` });
    } finally {
      setBusy(null);
      await load(chapter.id);
    }
  }

  async function approveExact() {
    if (!chapter) return;
    setBusy('approve');
    try {
      const response = await fetch(`/api/admin/books/${bookId}/revision-content/approve`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ chapterId: chapter.id }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Could not approve');
      setMessage({ kind: 'success', text: `Approved ${data.approved} exact match${data.approved === 1 ? '' : 'es'}. ${data.remainingForReview} still need your review.` });
      await load(chapter.id);
    } catch (e) {
      setMessage({ kind: 'error', text: e instanceof Error ? e.message : 'Could not approve' });
    } finally {
      setBusy(null);
    }
  }

  async function update(item: Item, patch: Record<string, unknown>, label: string) {
    setBusy(item.id);
    try {
      const response = await fetch(`/api/admin/revision-items/${item.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(patch) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || `Could not ${label}`);
      setEdits((previous) => { const next = { ...previous }; delete next[item.id]; return next; });
      await load(chapterId);
    } catch (e) {
      setMessage({ kind: 'error', text: e instanceof Error ? e.message : `Could not ${label}` });
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="mx-auto max-w-6xl space-y-5 p-4 sm:p-6">
      <Link href="/admin/question-bank/books" className="inline-flex items-center gap-2 text-sm font-bold text-slate-500 hover:text-slate-800 dark:text-slate-400"><ArrowLeft className="h-4 w-4" /> Book Library</Link>
      <div>
        <h1 className="font-display text-2xl font-black text-slate-900 dark:text-white">Revision content{book ? ` · ${book.title}` : ''}</h1>
        <p className="mt-1 max-w-3xl text-sm text-slate-500 dark:text-slate-400">
          Definitions, theorem statements, formulas and properties copied from each chapter, for students&apos; revision sheets and flashcards. The text is copied from the book&apos;s pages, never written for it, and each item is checked against its source page. Students only see what you approve.
        </p>
      </div>

      {message && <p className={`rounded-xl border p-3 text-sm font-semibold ${message.kind === 'success' ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-red-200 bg-red-50 text-red-700'}`}>{message.text}</p>}

      {loading ? (
        <div className="flex h-32 items-center justify-center text-sm text-slate-400"><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading…</div>
      ) : chapters.length === 0 ? (
        <p className="rounded-xl border border-slate-200 bg-slate-50 p-6 text-center text-sm text-slate-500">This book has no chapters with page ranges yet. Detect and confirm its chapter manifest first.</p>
      ) : (
        <div className="grid gap-5 lg:grid-cols-[17rem_1fr]">
          <ul className="h-fit divide-y divide-slate-200 overflow-hidden rounded-2xl border border-slate-200 bg-white dark:divide-white/10 dark:border-white/10 dark:bg-surface">
            {chapters.map((c) => (
              <li key={c.id}>
                <button type="button" onClick={() => { setChapterId(c.id); setView('DRAFT'); setMessage(null); }} className={`w-full px-4 py-3 text-left hover:bg-slate-50 dark:hover:bg-white/5 ${c.id === chapterId ? 'bg-indigo-50 dark:bg-brand/10' : ''}`}>
                  <p className="text-sm font-black text-slate-900 dark:text-white">{c.chapterNumber ? `${c.chapterNumber}. ` : ''}{c.name}</p>
                  <p className="mt-0.5 text-[11px] text-slate-400">pages {c.startPage}–{c.endPage}</p>
                  <p className="mt-1 flex gap-3 text-[11px] font-bold tabular-nums">
                    <span className="text-emerald-700">{c.counts.APPROVED} approved</span>
                    {c.counts.DRAFT > 0 && <span className="text-amber-700">{c.counts.DRAFT} to review</span>}
                  </p>
                </button>
              </li>
            ))}
          </ul>

          <section className="min-w-0 space-y-4">
            {!chapter ? (
              <p className="rounded-xl border border-dashed border-slate-300 p-10 text-center text-sm text-slate-400">Choose a chapter to extract and review its revision content.</p>
            ) : (
              <>
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="mr-auto font-display text-lg font-black text-slate-900 dark:text-white">{chapter.name}</h2>
                  <button type="button" disabled={busy !== null} onClick={() => void extract()} className={`${button} border-indigo-300 bg-indigo-50 text-indigo-700 hover:bg-indigo-100`}>
                    {busy === 'extract' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />} Find revision content
                  </button>
                  {chapter.counts.DRAFT > 0 && (
                    <button type="button" disabled={busy !== null} onClick={() => void approveExact()} className={`${button} border-emerald-300 bg-emerald-50 text-emerald-800 hover:bg-emerald-100`}>
                      {busy === 'approve' ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />} Approve exact matches
                    </button>
                  )}
                </div>
                <p className="text-xs text-slate-400">Finding content reads the chapter&apos;s pages with a language model (a few pages per request) and saves what it finds as drafts. It needs the chapter&apos;s pages to have been read by question extraction first.</p>

                <div className="flex gap-2">
                  {(['DRAFT', 'APPROVED'] as const).map((v) => (
                    <button key={v} type="button" onClick={() => setView(v)} className={`rounded-lg px-3 py-1.5 text-xs font-bold ${view === v ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>
                      {v === 'DRAFT' ? `To review (${chapter.counts.DRAFT})` : `Approved (${chapter.counts.APPROVED})`}
                    </button>
                  ))}
                </div>

                {shown.length === 0 ? (
                  <p className="rounded-xl border border-slate-200 bg-slate-50 p-6 text-center text-sm text-slate-500">{view === 'DRAFT' ? 'Nothing waiting for review in this chapter.' : 'Nothing approved yet.'}</p>
                ) : shown.map((item) => {
                  const edit = edits[item.id] ?? {};
                  const title = edit.title ?? item.title;
                  const text = edit.body ?? item.body;
                  const kind = edit.kind ?? item.kind;
                  const dirty = Object.keys(edit).length > 0;
                  const tier = TIER[item.tier];
                  return (
                    <article key={item.id} className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4 dark:border-white/10 dark:bg-surface">
                      <div className="flex flex-wrap items-center gap-2">
                        <select aria-label="Kind" value={kind} onChange={(e) => setEdits({ ...edits, [item.id]: { ...edit, kind: e.target.value as RevisionKind } })} className="rounded-lg border border-slate-200 px-2 py-1 text-xs font-bold">
                          {REVISION_KINDS.map((k) => <option key={k} value={k}>{KIND_LABEL[k]}</option>)}
                        </select>
                        <input aria-label="Title" value={title} onChange={(e) => setEdits({ ...edits, [item.id]: { ...edit, title: e.target.value } })} className="min-w-[12rem] flex-1 rounded-lg border border-slate-200 px-2 py-1 text-sm font-bold" />
                        <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-bold ${tier.className}`}>{item.tier !== 'EXACT' && <AlertTriangle className="h-3 w-3" />}{tier.label}</span>
                        <Link href={`/admin/question-bank/books/${bookId}/source?page=${item.sourcePage}`} target="_blank" className="inline-flex items-center gap-1 text-[11px] font-bold text-indigo-600 hover:underline"><BookOpen className="h-3 w-3" /> page {item.sourcePage}</Link>
                      </div>
                      <div className="grid gap-3 md:grid-cols-2">
                        <textarea aria-label="Text" value={text} rows={5} onChange={(e) => setEdits({ ...edits, [item.id]: { ...edit, body: e.target.value } })} className="w-full rounded-xl border border-slate-200 bg-slate-50 p-3 font-mono text-xs" />
                        <div className="rounded-xl border border-slate-100 bg-white p-3 text-sm"><MathRenderer content={spaceMathBoundaries(text)} /></div>
                      </div>
                      {item.reviewNotes && item.status === 'DRAFT' && <p className="text-xs font-semibold text-amber-700">{item.reviewNotes}</p>}
                      <div className="flex flex-wrap gap-2">
                        {dirty && <button type="button" disabled={busy !== null} onClick={() => void update(item, { ...edit }, 'save')} className={`${button} border-slate-300 bg-white text-slate-700`}><Save className="h-4 w-4" /> Save changes</button>}
                        {item.status !== 'APPROVED' && <button type="button" disabled={busy !== null} onClick={() => void update(item, { ...edit, status: 'APPROVED' }, 'approve')} className={`${button} border-emerald-300 bg-emerald-50 text-emerald-800`}><CheckCircle2 className="h-4 w-4" /> Approve{dirty ? ' with changes' : ''}</button>}
                        <button type="button" disabled={busy !== null} onClick={() => void update(item, { status: 'ARCHIVED' }, 'archive')} className={`${button} border-slate-200 bg-white text-slate-500`}><Archive className="h-4 w-4" /> Archive</button>
                      </div>
                    </article>
                  );
                })}
              </>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
