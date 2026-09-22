'use client';

import { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { ArrowLeft, ChevronLeft, ChevronRight, Loader2, RotateCw } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import toast from 'react-hot-toast';
import { readJsonResponse } from '@/lib/http-json';
import type { SM2Grade } from '@/lib/spaced-repetition';

type Card = { id: string; front: string; back: string; topic: string | null };

const GRADE_BUTTONS: { grade: SM2Grade; label: string; className: string }[] = [
  { grade: 'AGAIN', label: 'Again', className: 'bg-rose-50 text-rose-700 border-rose-200 hover:bg-rose-100 dark:bg-rose-500/10 dark:text-rose-400 dark:border-rose-500/30 dark:hover:bg-rose-500/20' },
  { grade: 'HARD', label: 'Hard', className: 'bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100 dark:bg-accent-warm/10 dark:text-accent-warm dark:border-accent-warm/30 dark:hover:bg-accent-warm/20' },
  { grade: 'GOOD', label: 'Good', className: 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100 dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-500/30 dark:hover:bg-emerald-500/20' },
  { grade: 'EASY', label: 'Easy', className: 'bg-indigo-50 text-indigo-700 border-indigo-200 hover:bg-indigo-100 dark:bg-brand/10 dark:text-brand dark:border-brand/30 dark:hover:bg-brand/20' },
];

function shuffle<T>(arr: T[]): T[] {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function FlashcardStudyInner() {
  const searchParams = useSearchParams();
  const dueOnly = searchParams?.get('mode') === 'due';

  const [cards, setCards] = useState<Card[]>([]);
  const [loading, setLoading] = useState(true);
  const [index, setIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [grading, setGrading] = useState(false);

  useEffect(() => {
    fetch(`/api/student/flashcards/mine${dueOnly ? '?mode=due' : ''}`)
      .then((response) => response.json())
      .then((data) => setCards(shuffle(data.cards || [])))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dueOnly]);

  const go = (delta: number) => {
    setFlipped(false);
    setIndex((i) => Math.max(0, Math.min(cards.length - 1, i + delta)));
  };

  const handleGrade = async (grade: SM2Grade) => {
    const card = cards[index];
    if (!card || grading) return;
    setGrading(true);
    try {
      const response = await fetch('/api/student/flashcards/review', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ flashcardId: card.id, grade }),
      });
      if (!response.ok) {
        const body = await readJsonResponse(response);
        toast.error((body?.error as string) || 'Could not save that review');
        return;
      }
      // In due-only mode, a graded card may no longer belong in this
      // session (it's rescheduled forward), so drop it from the queue
      // rather than just advancing past it.
      if (dueOnly) {
        setCards((prev) => prev.filter((c) => c.id !== card.id));
        setFlipped(false);
        setIndex((i) => Math.min(i, Math.max(0, cards.length - 2)));
      } else {
        go(1);
      }
    } finally {
      setGrading(false);
    }
  };

  if (loading) return <main className="min-h-screen bg-slate-50 dark:bg-background p-10"><Loader2 className="mx-auto my-20 h-8 w-8 animate-spin text-indigo-600 dark:text-brand" /></main>;

  return (
    <main className="min-h-screen bg-slate-50 dark:bg-background p-6 md:p-10">
      <div className="mx-auto max-w-xl">
        <Link href="/student/flashcards" className="mb-6 inline-flex items-center gap-2 text-sm font-bold text-indigo-700 dark:text-brand">
          <ArrowLeft className="h-4 w-4" />All flashcards
        </Link>

        {cards.length === 0 ? (
          <div className="rounded-3xl border border-dashed dark:border-white/10 bg-white dark:bg-surface p-16 text-center font-bold text-slate-600 dark:text-slate-400">
            {dueOnly ? "No cards due for review right now — nice work!" : 'No flashcards to study yet.'}
          </div>
        ) : (
          <>
            <p className="mb-4 text-center text-sm font-black uppercase tracking-wide text-slate-400 dark:text-slate-500">
              {dueOnly ? `${cards.length} due` : `Card ${index + 1} of ${cards.length}`}
            </p>
            <AnimatePresence mode="wait">
              <motion.div
                key={cards[index].id}
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                onClick={() => setFlipped((f) => !f)}
                className="flex min-h-[16rem] cursor-pointer flex-col items-center justify-center rounded-3xl border dark:border-white/10 bg-white dark:bg-surface p-10 text-center shadow-lg dark:shadow-none"
              >
                {cards[index].topic && <span className="mb-4 rounded-full bg-slate-100 dark:bg-white/5 px-2.5 py-1 text-xs font-black uppercase tracking-wide text-slate-500 dark:text-slate-400">{cards[index].topic}</span>}
                <p className="text-lg font-black text-slate-900 dark:text-white">{flipped ? cards[index].back : cards[index].front}</p>
                {!flipped && <p className="mt-6 flex items-center gap-1 text-xs font-bold text-slate-400 dark:text-slate-500"><RotateCw className="h-3 w-3" />Tap to flip</p>}
              </motion.div>
            </AnimatePresence>

            {flipped ? (
              <div className="mt-6 grid grid-cols-4 gap-2">
                {GRADE_BUTTONS.map(({ grade, label, className }) => (
                  <button
                    key={grade}
                    type="button"
                    disabled={grading}
                    onClick={() => handleGrade(grade)}
                    className={`rounded-2xl border-2 px-3 py-3 text-xs font-black uppercase tracking-wide transition disabled:opacity-40 ${className}`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            ) : (
              <div className="mt-6 flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => go(-1)}
                  disabled={index === 0}
                  className="inline-flex items-center gap-2 rounded-2xl border-2 border-slate-200 dark:border-white/10 px-5 py-3 text-sm font-black text-slate-600 dark:text-slate-400 disabled:opacity-30"
                >
                  <ChevronLeft className="h-4 w-4" />Previous
                </button>
                <button
                  type="button"
                  onClick={() => go(1)}
                  disabled={index === cards.length - 1}
                  className="inline-flex items-center gap-2 rounded-2xl bg-gradient-to-br from-indigo-600 to-violet-600 dark:from-brand dark:to-brand-violet px-5 py-3 text-sm font-black text-white disabled:opacity-30"
                >
                  Next<ChevronRight className="h-4 w-4" />
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </main>
  );
}

export default function FlashcardStudyClient() {
  return (
    <Suspense fallback={
      <main className="min-h-screen bg-slate-50 dark:bg-background p-10"><Loader2 className="mx-auto my-20 h-8 w-8 animate-spin text-indigo-600 dark:text-brand" /></main>
    }>
      <FlashcardStudyInner />
    </Suspense>
  );
}
