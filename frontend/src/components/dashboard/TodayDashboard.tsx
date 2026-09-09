'use client';

import Link from 'next/link';
import type { LucideIcon } from 'lucide-react';
import { ArrowRight, CalendarDays } from 'lucide-react';

type Tone = 'indigo' | 'emerald' | 'amber' | 'rose' | 'sky';

export interface TodayMetric {
    label: string;
    value: string | number;
    hint?: string;
    icon: LucideIcon;
    tone?: Tone;
}

export interface TodayPriority {
    title: string;
    detail: string;
    tone?: 'neutral' | 'attention' | 'success';
}

export interface TodayAction {
    label: string;
    href?: string;
    onClick?: () => void;
    icon: LucideIcon;
}

interface TodayDashboardProps {
    role: string;
    title: string;
    description: string;
    metrics: TodayMetric[];
    priorities: TodayPriority[];
    actions: TodayAction[];
}

const metricTones: Record<Tone, string> = {
    indigo: 'bg-indigo-50 text-indigo-700',
    emerald: 'bg-emerald-50 text-emerald-700',
    amber: 'bg-amber-50 text-amber-700',
    rose: 'bg-rose-50 text-rose-700',
    sky: 'bg-sky-50 text-sky-700',
};

const priorityTones = {
    neutral: 'border-slate-200 bg-slate-50',
    attention: 'border-amber-200 bg-amber-50',
    success: 'border-emerald-200 bg-emerald-50',
};

export function TodayDashboard({ role, title, description, metrics, priorities, actions }: TodayDashboardProps) {
    const dateLabel = new Intl.DateTimeFormat('en-IN', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
    }).format(new Date());

    return (
        <section className="today-shell" aria-labelledby="today-heading">
            <div className="today-hero">
                <div className="relative z-10 max-w-3xl">
                    <div className="mb-4 flex flex-wrap items-center gap-3 text-sm font-semibold text-indigo-100">
                        <span className="rounded-full bg-white/12 px-3 py-1 uppercase tracking-[0.16em]">{role}</span>
                        <span className="inline-flex items-center gap-2"><CalendarDays className="h-4 w-4" />{dateLabel}</span>
                    </div>
                    <h1 id="today-heading" className="text-3xl font-black tracking-tight text-white sm:text-4xl">{title}</h1>
                    <p className="mt-3 max-w-2xl text-sm leading-6 text-indigo-100 sm:text-base">{description}</p>
                </div>
                <div className="today-hero-orb" aria-hidden="true" />
            </div>

            <div className="today-metrics">
                {metrics.map(({ label, value, hint, icon: Icon, tone = 'indigo' }) => (
                    <article key={label} className="today-card" aria-label={`${label}: ${value}`}>
                        <div className={`today-icon ${metricTones[tone]}`}><Icon className="h-5 w-5" /></div>
                        <p className="mt-5 text-xs font-bold uppercase tracking-[0.13em] text-slate-500">{label}</p>
                        <p className="mt-2 text-3xl font-black tracking-tight text-slate-950">{value}</p>
                        {hint && <p className="mt-1 text-xs font-medium text-slate-500">{hint}</p>}
                    </article>
                ))}
            </div>

            <div className="grid gap-5 lg:grid-cols-[1.35fr_1fr]">
                <div className="today-panel">
                    <div className="mb-4 flex items-center justify-between">
                        <div>
                            <p className="today-kicker">Focus</p>
                            <h2 className="today-title">Your priorities</h2>
                        </div>
                        <span className="text-xs font-semibold text-slate-400">Today</span>
                    </div>
                    <div className="space-y-3">
                        {priorities.map(({ title: priorityTitle, detail, tone = 'neutral' }) => (
                            <div key={`${priorityTitle}-${detail}`} className={`rounded-2xl border p-4 ${priorityTones[tone]}`}>
                                <p className="font-bold text-slate-900">{priorityTitle}</p>
                                <p className="mt-1 text-sm text-slate-600">{detail}</p>
                            </div>
                        ))}
                    </div>
                </div>

                <div className="today-panel">
                    <p className="today-kicker">Shortcuts</p>
                    <h2 className="today-title">Quick actions</h2>
                    <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
                        {actions.map(({ label, href, onClick, icon: Icon }) => {
                            const content = <><span className="inline-flex items-center gap-3"><Icon className="h-5 w-5 text-indigo-600" />{label}</span><ArrowRight className="h-4 w-4 text-slate-400" /></>;
                            const className = 'today-action';
                            return href
                                ? <Link key={label} href={href} className={className}>{content}</Link>
                                : <button key={label} type="button" onClick={onClick} className={className}>{content}</button>;
                        })}
                    </div>
                </div>
            </div>
        </section>
    );
}
