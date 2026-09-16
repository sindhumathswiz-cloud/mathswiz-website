'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, ChevronLeft, ChevronRight, Loader2, RotateCw } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

type Card = { id: string; front: string; back: string; topic: string | null };

function shuffle<T>(arr: T[]): T[] {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

export default function FlashcardStudyClient() {
  const [cards, setCards] = useState<Card[]>([]);
  const [loading, setLoading] = useState(true);
  const [index, setIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);

  useEffect(() => {
    fetch('/api/student/flashcards/mine')
      .then((response) => response.json())
      .then((data) => setCards(shuffle(data.cards || [])))
      .finally(() => setLoading(false));
  }, []);

  const go = (delta: number) => {
    setFlipped(false);
    setIndex((i) => Math.max(0, Math.min(cards.length - 1, i + delta)));
  };

  if (loading) return <main className="min-h-screen bg-slate-50 p-10"><Loader2 className="mx-auto my-20 h-8 w-8 animate-spin text-indigo-600" /></main>;

  return (
    <main className="min-h-screen bg-slate-50 p-6 md:p-10">
      <div className="mx-auto max-w-xl">
        <Link href="/student/flashcards" className="mb-6 inline-flex items-center gap-2 text-sm font-bold text-indigo-700">
          <ArrowLeft className="h-4 w-4" />All flashcards
        </Link>

        {cards.length === 0 ? (
          <div className="rounded-3xl border border-dashed bg-white p-16 text-center font-bold text-slate-600">
            No flashcards to study yet.
          </div>
        ) : (
          <>
            <p className="mb-4 text-center text-sm font-black uppercase tracking-wide text-slate-400">
              Card {index + 1} of {cards.length}
            </p>
            <AnimatePresence mode="wait">
              <motion.div
                key={cards[index].id}
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                onClick={() => setFlipped((f) => !f)}
                className="flex min-h-[16rem] cursor-pointer flex-col items-center justify-center rounded-3xl border bg-white p-10 text-center shadow-lg"
              >
                {cards[index].topic && <span className="mb-4 rounded-full bg-slate-100 px-2.5 py-1 text-xs font-black uppercase tracking-wide text-slate-500">{cards[index].topic}</span>}
                <p className="text-lg font-black text-slate-900">{flipped ? cards[index].back : cards[index].front}</p>
                <p className="mt-6 flex items-center gap-1 text-xs font-bold text-slate-400"><RotateCw className="h-3 w-3" />Tap to flip</p>
              </motion.div>
            </AnimatePresence>

            <div className="mt-6 flex items-center justify-between">
              <button
                type="button"
                onClick={() => go(-1)}
                disabled={index === 0}
                className="inline-flex items-center gap-2 rounded-2xl border-2 border-slate-200 px-5 py-3 text-sm font-black text-slate-600 disabled:opacity-30"
              >
                <ChevronLeft className="h-4 w-4" />Previous
              </button>
              <button
                type="button"
                onClick={() => go(1)}
                disabled={index === cards.length - 1}
                className="inline-flex items-center gap-2 rounded-2xl bg-indigo-600 px-5 py-3 text-sm font-black text-white disabled:opacity-30"
              >
                Next<ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </>
        )}
      </div>
    </main>
  );
}
