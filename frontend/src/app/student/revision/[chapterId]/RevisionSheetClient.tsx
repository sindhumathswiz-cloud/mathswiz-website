'use client';

import Link from 'next/link';
import { useState } from 'react';
import { ArrowLeft, Check, Layers, Loader2, Plus, Printer } from 'lucide-react';
import toast from 'react-hot-toast';
import MathRenderer from '@/components/MathRenderer';
import { spaceMathBoundaries } from '@/lib/revision-content';
import type { RevisionSheet } from '@/lib/student-revision';

export default function RevisionSheetClient({ sheet }: { sheet: RevisionSheet }) {
  const [added, setAdded] = useState<Set<string>>(() => new Set(sheet.groups.flatMap((group) => group.items.filter((item) => item.inFlashcards).map((item) => item.id))));
  const [busy, setBusy] = useState<string | null>(null);

  async function addToFlashcards(itemIds?: string[]) {
    setBusy(itemIds?.[0] ?? 'all');
    try {
      const response = await fetch(`/api/student/revision/${sheet.chapter.id}/flashcards`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(itemIds ? { itemIds } : {}),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Could not add flashcards');
      const ids = itemIds ?? sheet.groups.flatMap((group) => group.items.map((item) => item.id));
      setAdded((previous) => new Set([...previous, ...ids]));
      toast.success(data.added > 0 ? `${data.added} flashcard${data.added === 1 ? '' : 's'} added to your deck` : 'Already in your flashcards');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not add flashcards');
    } finally {
      setBusy(null);
    }
  }

  const allAdded = added.size >= sheet.total;

  return (
    <main className="min-h-screen bg-slate-50 p-6 dark:bg-background md:p-10 print:bg-white print:p-0">
      <style>{`@media print { aside, nav, .no-print { display: none !important; } .sheet-group { break-inside: avoid-page; } .sheet-item { break-inside: avoid; } }`}</style>
      <div className="mx-auto max-w-3xl">
        <Link href="/student/revision" className="no-print mb-6 inline-flex items-center gap-2 text-sm font-bold text-indigo-700 dark:text-brand">
          <ArrowLeft className="h-4 w-4" />All revision sheets
        </Link>

        <header className="mb-8 flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-black uppercase tracking-widest text-indigo-600 dark:text-brand">{sheet.chapter.bookTitle}</p>
            <h1 className="font-display text-3xl font-black text-slate-900 dark:text-white">{sheet.chapter.chapterNumber ? `${sheet.chapter.chapterNumber}. ` : ''}{sheet.chapter.name}</h1>
            <p className="mt-1 text-slate-600 dark:text-slate-400">{sheet.total} item{sheet.total === 1 ? '' : 's'} to revise, in the book&apos;s own words.</p>
          </div>
          <div className="no-print flex flex-wrap gap-2">
            <button type="button" onClick={() => window.print()} className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-black text-slate-700 hover:bg-slate-50">
              <Printer className="h-4 w-4" /> Print
            </button>
            <button type="button" disabled={busy !== null || allAdded} onClick={() => void addToFlashcards()} className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-black text-white hover:bg-indigo-500 disabled:opacity-60">
              {busy === 'all' ? <Loader2 className="h-4 w-4 animate-spin" /> : allAdded ? <Check className="h-4 w-4" /> : <Layers className="h-4 w-4" />}
              {allAdded ? 'All in your flashcards' : 'Make flashcards of all'}
            </button>
            {added.size > 0 && (
              <Link href="/student/flashcards/study" className="inline-flex items-center gap-2 rounded-xl border border-indigo-200 bg-indigo-50 px-4 py-2.5 text-sm font-black text-indigo-700 hover:bg-indigo-100">
                Study flashcards
              </Link>
            )}
          </div>
        </header>

        <div className="space-y-8">
          {sheet.groups.map((group) => (
            <section key={group.kind} className="sheet-group">
              <h2 className="mb-3 border-b border-slate-200 pb-2 font-display text-xl font-black text-slate-900 dark:border-white/10 dark:text-white">{group.label}</h2>
              <ul className="space-y-3">
                {group.items.map((item) => (
                  <li key={item.id} className="sheet-item rounded-2xl border border-slate-200 bg-white p-4 dark:border-white/10 dark:bg-surface">
                    <div className="mb-2 flex items-start justify-between gap-3">
                      <h3 className="font-black text-slate-900 dark:text-white">{item.title}</h3>
                      <div className="no-print flex shrink-0 items-center gap-3">
                        <span className="text-[11px] font-bold text-slate-400">p. {item.sourcePage}</span>
                        {added.has(item.id) ? (
                          <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-700"><Check className="h-3 w-3" /> flashcard</span>
                        ) : (
                          <button type="button" disabled={busy !== null} onClick={() => void addToFlashcards([item.id])} className="inline-flex items-center gap-1 text-[11px] font-bold text-indigo-700 hover:underline disabled:opacity-50">
                            {busy === item.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />} flashcard
                          </button>
                        )}
                      </div>
                    </div>
                    <div className="text-slate-800 dark:text-slate-200"><MathRenderer content={spaceMathBoundaries(item.body)} /></div>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      </div>
    </main>
  );
}
