'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Loader2, RotateCcw, Target, TrendingUp } from 'lucide-react';
import { masteryBand, masterySummary, type MasteryTopic } from '@/lib/mastery-view';

type History = { id: string; topic: string; source: string; previousScore: number; newScore: number; delta: number; createdAt: string };

export default function StudentMasteryClient() {
  const [topics, setTopics] = useState<MasteryTopic[]>([]);
  const [history, setHistory] = useState<History[]>([]);
  const [loading, setLoading] = useState(true);
  const [mistakesDue, setMistakesDue] = useState(0);
  useEffect(() => { fetch('/api/student/mastery').then((response) => response.json()).then((data) => { setTopics(data.topics || []); setHistory(data.history || []); }).finally(() => setLoading(false)); }, []);
  useEffect(() => { fetch('/api/student/practice/mistakes').then((response) => response.json()).then((data) => { if (typeof data.dueCount === 'number') setMistakesDue(data.dueCount); }).catch(() => {}); }, []);
  const summary = useMemo(() => masterySummary(topics), [topics]);
  const colors = { needs_support: 'bg-rose-500', developing: 'bg-amber-500', secure: 'bg-emerald-500' };
  return <main className="min-h-screen bg-slate-50 p-6 md:p-10"><div className="mx-auto max-w-6xl">
    <Link href="/student/dashboard" className="mb-6 inline-flex items-center gap-2 text-sm font-bold text-indigo-700"><ArrowLeft className="h-4 w-4" />Student dashboard</Link>
    <div className="mb-8 flex flex-wrap items-center justify-between gap-4"><div className="flex items-center gap-3"><Target className="h-9 w-9 text-indigo-600" /><div><h1 className="text-3xl font-black text-slate-900">My mastery</h1><p className="text-slate-600">See secure topics and where to practise next.</p></div></div>
      {mistakesDue > 0 && <Link href="/student/practice?mode=mistakes" className="inline-flex items-center gap-2 rounded-2xl bg-amber-500 px-5 py-3 text-sm font-black text-white shadow-lg shadow-amber-200 hover:bg-amber-600 transition-colors"><RotateCcw className="h-4 w-4" />Review {mistakesDue} mistake{mistakesDue === 1 ? '' : 's'}</Link>}
    </div>
    {loading ? <Loader2 className="mx-auto my-20 h-8 w-8 animate-spin text-indigo-600" /> : topics.length === 0 ? <div className="rounded-3xl border border-dashed bg-white p-16 text-center font-bold text-slate-600">Complete practice or a test to begin building mastery.</div> : <>
      <div className="mb-8 grid gap-4 sm:grid-cols-4">{[['Average', summary.average], ['Needs support', summary.needsSupport.length], ['Developing', summary.developing.length], ['Secure', summary.secure.length]].map(([label, value]) => <div key={label} className="rounded-2xl border bg-white p-5"><p className="text-xs font-black uppercase text-slate-500">{label}</p><p className="text-3xl font-black text-slate-900">{value}{label === 'Average' ? '%' : ''}</p></div>)}</div>
      <section className="mb-8 rounded-3xl border bg-white p-6"><h2 className="mb-5 text-xl font-black text-slate-900">Topic mastery</h2><div className="space-y-5">{topics.map((item) => { const band = masteryBand(item.masteryScore); return <div key={item.topic}><div className="mb-1 flex justify-between font-bold"><span>{item.topic}</span><span>{item.masteryScore}%</span></div><div className="h-3 overflow-hidden rounded-full bg-slate-100"><div className={`h-full ${colors[band]}`} style={{ width: `${item.masteryScore}%` }} /></div></div>; })}</div></section>
      <section className="rounded-3xl border bg-white p-6"><h2 className="mb-4 flex items-center gap-2 text-xl font-black"><TrendingUp className="h-5 w-5 text-indigo-600" />Recent changes</h2><div className="divide-y">{history.slice(0, 20).map((item) => <div key={item.id} className="flex justify-between gap-4 py-3 text-sm"><div><p className="font-bold">{item.topic}</p><p className="text-slate-500">{item.source} · {new Date(item.createdAt).toLocaleDateString('en-IN')}</p></div><span className={`font-black ${item.delta >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>{item.previousScore} → {item.newScore}</span></div>)}</div></section>
    </>}
  </div></main>;
}
