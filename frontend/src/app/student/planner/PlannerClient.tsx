'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { BookX, CalendarClock, ClipboardList, Layers, Loader2, Target } from 'lucide-react';

type ItemType = 'QUESTION_REVIEW' | 'FLASHCARD_REVIEW' | 'TEST' | 'INTERVENTION';
type PlannerItem = { id: string; type: ItemType; title: string; date: string; href: string };
type PlannerBucket = { label: string; date: string; items: PlannerItem[] };

const ITEM_META: Record<ItemType, { icon: typeof BookX; label: string; className: string }> = {
  QUESTION_REVIEW: { icon: BookX, label: 'Review', className: 'bg-rose-50 text-rose-700 border-rose-100' },
  FLASHCARD_REVIEW: { icon: Layers, label: 'Flashcard', className: 'bg-indigo-50 text-indigo-700 border-indigo-100' },
  TEST: { icon: ClipboardList, label: 'Test / Homework', className: 'bg-amber-50 text-amber-700 border-amber-100' },
  INTERVENTION: { icon: Target, label: 'Assigned by teacher', className: 'bg-emerald-50 text-emerald-700 border-emerald-100' },
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
    <main className="min-h-screen bg-slate-50 p-6 md:p-10">
      <div className="mx-auto max-w-3xl">
        <div className="mb-8 flex items-center gap-3">
          <CalendarClock className="h-9 w-9 text-indigo-600" />
          <div>
            <h1 className="text-3xl font-black text-slate-900">Revision Planner</h1>
            <p className="text-slate-600">Spaced reviews, tests, and assigned work — laid out for the week ahead.</p>
          </div>
        </div>

        {loading ? (
          <Loader2 className="mx-auto my-20 h-8 w-8 animate-spin text-indigo-600" />
        ) : totalDue === 0 ? (
          <div className="rounded-3xl border border-dashed bg-white p-16 text-center font-bold text-slate-600">
            Nothing due this week — you&apos;re all caught up.
          </div>
        ) : (
          <div className="space-y-6">
            {buckets.map((bucket) => (
              <div key={bucket.label} className={`rounded-3xl border bg-white p-6 ${bucket.label === 'Overdue' ? 'border-rose-200' : 'border-slate-200'}`}>
                <div className="mb-4 flex items-center justify-between">
                  <h2 className={`text-sm font-black uppercase tracking-wide ${bucket.label === 'Overdue' ? 'text-rose-600' : 'text-slate-900'}`}>
                    {bucket.label}
                  </h2>
                  <span className="text-xs font-bold text-slate-400">{bucket.items.length} due</span>
                </div>
                {bucket.items.length === 0 ? (
                  <p className="text-sm text-slate-400">Nothing due.</p>
                ) : (
                  <div className="space-y-2">
                    {bucket.items.map((item) => {
                      const meta = ITEM_META[item.type];
                      const Icon = meta.icon;
                      return (
                        <Link
                          key={item.id}
                          href={item.href}
                          className="flex items-center gap-3 rounded-2xl border border-slate-100 p-3 transition hover:border-indigo-200 hover:bg-indigo-50/40"
                        >
                          <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border ${meta.className}`}>
                            <Icon className="h-4 w-4" />
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-bold text-slate-900">{item.title}</span>
                            <span className="text-xs font-semibold text-slate-400">{meta.label}</span>
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
