'use client';

import Link from 'next/link';
import { Crown, LockKeyhole } from 'lucide-react';

export function PremiumBanner({ audience }: { audience: 'student' | 'teacher' }) {
    return (
        <div className="mb-6 flex flex-col gap-4 rounded-2xl border border-violet-200 bg-gradient-to-r from-violet-50 via-white to-amber-50 p-5 shadow-sm sm:flex-row sm:items-center sm:justify-between">
            <div className="flex gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-violet-600 text-white"><Crown className="h-5 w-5" /></div>
                <div>
                    <p className="font-black text-slate-900">Free account — explore the full {audience} dashboard</p>
                    <p className="mt-1 text-sm text-slate-600">Premium tools and full-course content stay visible with a lock, so you can see exactly what your subscription unlocks.</p>
                </div>
            </div>
            <Link href="/pricing" className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-violet-600 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-violet-700">
                <Crown className="h-4 w-4" /> View plans
            </Link>
        </div>
    );
}

export function PremiumFeatureNotice({ title, description, freeAlternative }: { title: string; description: string; freeAlternative?: React.ReactNode }) {
    return (
        <div className="flex min-h-[280px] flex-col items-center justify-center rounded-2xl border border-dashed border-violet-200 bg-gradient-to-br from-violet-50/80 via-white to-amber-50/70 p-8 text-center">
            <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-violet-600 text-white shadow-lg shadow-violet-200"><LockKeyhole className="h-6 w-6" /></div>
            <span className="mb-2 inline-flex items-center gap-1 rounded-full bg-violet-100 px-3 py-1 text-xs font-black uppercase tracking-wider text-violet-700"><Crown className="h-3.5 w-3.5" /> Premium</span>
            <h2 className="text-xl font-black text-slate-900">{title}</h2>
            <p className="mt-2 max-w-lg text-sm leading-6 text-slate-600">{description}</p>
            {freeAlternative && <div className="mt-5">{freeAlternative}</div>}
            <Link href="/pricing" className="mt-5 inline-flex items-center gap-2 rounded-xl bg-slate-900 px-5 py-3 text-sm font-bold text-white transition hover:bg-violet-700">
                <LockKeyhole className="h-4 w-4" /> Unlock premium
            </Link>
        </div>
    );
}
