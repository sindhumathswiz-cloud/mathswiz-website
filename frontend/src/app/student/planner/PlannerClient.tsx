'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { BookX, CalendarClock, ClipboardList, Layers, Loader2, Target } from 'lucide-react';

type ItemType = 'QUESTION_REVIEW' | 'FLASHCARD_REVIEW' | 'TEST' | 'INTERVENTION';
type PlannerItem = { id: string; type: ItemType; title: string; date: string; href: string };
type PlannerBucket = { label: string; date: string; items: PlannerItem[] };

const ITEM_META: Record<ItemType, { icon: typeof BookX; label: string; className: string }> = {
  QUESTION_REVIEW: { icon: BookX, label: 'Review', className: 'bg-rose-50 text-rose-700 border-rose-100 dark:bg-rose-500/10 dark:text-rose-400 dark:border-rose-500/30' },
  FLASHCARD_REVIEW: { icon: Layers, label: 'Flashcard', className: 'bg-indigo-50 text-indigo-700 border-indigo-100 dark:bg-brand/10 dark:text-brand dark:border-brand/30' },
  TEST: { icon: ClipboardList, label: 'Test / Homework', className: 'bg-amber-50 text-amber-700 border-amber-100 dark:bg-accent-warm/10 dark:text-accent-warm dark:border-accent-warm/30' },
  INTERVENTION: { icon: Target, label: 'Assigned by teacher', className: 'bg-emerald-50 text-emerald-700 border-emerald-100 dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-500/30' },
};

export default function PlannerClient() {
  const [buckets, setBuckets] = useState<PlannerBucket[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/student/planner')
      .then((response) => response.json())
      .then((data) => setBuckets(data.buckets || []))
      .finally(() => setLoading(false));
  }, []);

  const totalDue = buckets.reduce((sum, b) => sum + b.items.length, 0);

  return (
    <main className="min-h-screen bg-slate-50 dark:bg-background p-6 md:p-10">
      <div className="mx-auto max-w-3xl">
        <div className="mb-8 flex items-center gap-3">
          <CalendarClock className="h-9 w-9 text-indigo-600 dark:text-brand" />
          <div>
            <h1 className="font-display text-3xl font-black text-slate-900 dark:text-white">Revision Planner</h1>
            <p className="text-slate-600 dark:text-slate-400">Spaced reviews, tests, and assigned work — laid out for the week ahead.</p>
          </div>
        </div>

        {loading ? (
          <Loader2 className="mx-auto my-20 h-8 w-8 animate-spin text-indigo-600 dark:text-brand" />
        ) : totalDue === 0 ? (
          <div className="rounded-3xl border border-dashed dark:border-white/10 bg-white dark:bg-surface p-16 text-center font-bold text-slate-600 dark:text-slate-400">
            Nothing due this week — you&apos;re all caught up.
          </div>
        ) : (
          <div className="space-y-6">
            {buckets.map((bucket) => (
              <div key={bucket.label} className={`rounded-3xl border bg-white dark:bg-surface p-6 ${bucket.label === 'Overdue' ? 'border-rose-200 dark:border-rose-500/30' : 'border-slate-200 dark:border-white/10'}`}>
                <div className="mb-4 flex items-center justify-between">
                  <h2 className={`text-sm font-black uppercase tracking-wide ${bucket.label === 'Overdue' ? 'text-rose-600 dark:text-rose-400' : 'text-slate-900 dark:text-white'}`}>
                    {bucket.label}
                  </h2>
                  <span className="text-xs font-bold text-slate-400 dark:text-slate-500">{bucket.items.length} due</span>
                </div>
                {bucket.items.length === 0 ? (
                  <p className="text-sm text-slate-400 dark:text-slate-500">Nothing due.</p>
                ) : (
                  <div className="space-y-2">
                    {bucket.items.map((item) => {
                      const meta = ITEM_META[item.type];
                      const Icon = meta.icon;
                      return (
                        <Link
                          key={item.id}
                          href={item.href}
                          className="flex items-center gap-3 rounded-2xl border border-slate-100 dark:border-white/10 p-3 transition hover:border-indigo-200 dark:hover:border-brand/40 hover:bg-indigo-50/40 dark:hover:bg-brand/5"
                        >
                          <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border ${meta.className}`}>
                            <Icon className="h-4 w-4" />
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-bold text-slate-900 dark:text-white">{item.title}</span>
                            <span className="text-xs font-semibold text-slate-400 dark:text-slate-500">{meta.label}</span>
                          </span>
                        </Link>
                      );
                    })}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
