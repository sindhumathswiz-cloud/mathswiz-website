'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Clock, Layers, Loader2, Plus, Shuffle, Trash2, X } from 'lucide-react';
import toast from 'react-hot-toast';
import { readJsonResponse } from '@/lib/http-json';

type Card = { id: string; front: string; back: string; topic: string | null; updatedAt: string };

export default function FlashcardsClient() {
  const [cards, setCards] = useState<Card[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [front, setFront] = useState('');
  const [back, setBack] = useState('');
  const [topic, setTopic] = useState('');
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [dueCount, setDueCount] = useState(0);

  const load = () => {
    setLoading(true);
    fetch('/api/student/flashcards/mine')
      .then((response) => response.json())
      .then((data) => setCards(data.cards || []))
      .finally(() => setLoading(false));
  };

  const loadDueCount = () => {
    fetch('/api/student/flashcards/mine?mode=due')
      .then((response) => response.json())
      .then((data) => setDueCount(Array.isArray(data.cards) ? data.cards.length : 0))
      .catch(() => {});
  };

  useEffect(() => { load(); loadDueCount(); }, []);

  const create = async () => {
    if (!front.trim() || !back.trim() || saving) return;
    setSaving(true);
    try {
      const response = await fetch('/api/student/flashcards/mine', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ front: front.trim(), back: back.trim(), topic: topic.trim() || undefined }),
      });
      const body = await readJsonResponse<{ error?: string }>(response);
      if (!response.ok) {
        toast.error(body?.error || 'Could not create flashcard');
        return;
      }
      setFront(''); setBack(''); setTopic(''); setShowForm(false);
      load();
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id: string) => {
    setDeletingId(id);
    try {
      const response = await fetch(`/api/student/flashcards/mine/${id}`, { method: 'DELETE' });
      if (!response.ok) {
        toast.error('Could not delete flashcard');
        return;
      }
      setCards((prev) => prev.filter((c) => c.id !== id));
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <main className="min-h-screen bg-slate-50 dark:bg-background p-6 md:p-10">
      <div className="mx-auto max-w-4xl">
        <Link href="/student/dashboard" className="mb-6 inline-flex items-center gap-2 text-sm font-bold text-indigo-700 dark:text-brand">
          <ArrowLeft className="h-4 w-4" />Student dashboard
        </Link>
        <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Layers className="h-9 w-9 text-indigo-600 dark:text-brand" />
            <div>
              <h1 className="font-display text-3xl font-black text-slate-900 dark:text-white">Flashcards</h1>
              <p className="text-slate-600 dark:text-slate-400">Your own quick-recall cards — formulas, definitions, anything.</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {dueCount > 0 && (
              <Link href="/student/flashcards/study?mode=due" className="inline-flex items-center gap-2 rounded-2xl bg-amber-500 dark:bg-accent-warm px-5 py-3 text-sm font-black text-white shadow-lg shadow-amber-200 dark:shadow-none hover:bg-amber-600 transition-colors">
                <Clock className="h-4 w-4" />Study due ({dueCount})
              </Link>
            )}
            {cards.length > 0 && (
              <Link href="/student/flashcards/study" className="inline-flex items-center gap-2 rounded-2xl border-2 border-indigo-200 dark:border-brand/30 px-5 py-3 text-sm font-black text-indigo-700 dark:text-brand hover:bg-indigo-50 dark:hover:bg-brand/10 transition-colors">
                <Shuffle className="h-4 w-4" />Study
              </Link>
            )}
            <button
              type="button"
              onClick={() => setShowForm((s) => !s)}
              className="inline-flex items-center gap-2 rounded-2xl bg-gradient-to-br from-indigo-600 to-violet-600 dark:from-brand dark:to-brand-violet px-5 py-3 text-sm font-black text-white shadow-lg shadow-indigo-200 dark:shadow-none hover:opacity-90 transition-colors"
            >
              <Plus className="h-4 w-4" />New card
            </button>
          </div>
        </div>

        {showForm && (
          <div className="mb-6 space-y-3 rounded-2xl border dark:border-white/10 bg-white dark:bg-surface p-5">
            <div className="flex items-center justify-between">
              <p className="text-xs font-black uppercase tracking-wide text-slate-500 dark:text-slate-400">New flashcard</p>
              <button type="button" onClick={() => setShowForm(false)} className="text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300"><X className="h-4 w-4" /></button>
            </div>
            <textarea
              value={front}
              onChange={(e) => setFront(e.target.value)}
              placeholder="Front (question / prompt)"
              rows={2}
              className="w-full rounded-xl border border-slate-200 dark:border-white/10 dark:bg-white/5 px-4 py-2 text-sm font-bold text-slate-900 dark:text-white outline-none focus:border-indigo-400 dark:focus:border-brand"
            />
            <textarea
              value={back}
              onChange={(e) => setBack(e.target.value)}
              placeholder="Back (answer)"
              rows={2}
              className="w-full rounded-xl border border-slate-200 dark:border-white/10 dark:bg-white/5 px-4 py-2 text-sm font-bold text-slate-900 dark:text-white outline-none focus:border-indigo-400 dark:focus:border-brand"
            />
            <input
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              placeholder="Topic (optional)"
              className="w-full rounded-xl border border-slate-200 dark:border-white/10 dark:bg-white/5 px-4 py-2 text-sm font-bold text-slate-900 dark:text-white outline-none focus:border-indigo-400 dark:focus:border-brand"
            />
            <button
              type="button"
              onClick={create}
              disabled={saving || !front.trim() || !back.trim()}
              className="rounded-xl bg-gradient-to-br from-indigo-600 to-violet-600 dark:from-brand dark:to-brand-violet px-5 py-2 text-xs font-black text-white disabled:opacity-40"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Save card'}
            </button>
          </div>
        )}

        {loading ? (
          <Loader2 className="mx-auto my-20 h-8 w-8 animate-spin text-indigo-600 dark:text-brand" />
        ) : cards.length === 0 ? (
          <div className="rounded-3xl border border-dashed dark:border-white/10 bg-white dark:bg-surface p-16 text-center font-bold text-slate-600 dark:text-slate-400">
            No flashcards yet — create your first one above.
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            {cards.map((card) => (
              <div key={card.id} className="rounded-2xl border dark:border-white/10 bg-white dark:bg-surface p-5">
                {card.topic && <span className="mb-2 inline-block rounded-full bg-slate-100 dark:bg-white/5 px-2.5 py-1 text-xs font-black uppercase tracking-wide text-slate-500 dark:text-slate-400">{card.topic}</span>}
                <p className="mb-2 text-sm font-bold text-slate-900 dark:text-white">{card.front}</p>
                <p className="mb-3 text-sm text-slate-500 dark:text-slate-400">{card.back}</p>
                <button
                  type="button"
                  onClick={() => remove(card.id)}
                  disabled={deletingId === card.id}
                  className="inline-flex items-center gap-1 text-xs font-bold text-rose-600 dark:text-rose-400 hover:underline disabled:opacity-50"
                >
                  <Trash2 className="h-3 w-3" />Delete
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
