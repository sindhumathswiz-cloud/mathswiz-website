'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Loader2, Users } from 'lucide-react';
import { masterySummary, type MasteryTopic } from '@/lib/mastery-view';

type Batch = { id: string; name: string };
type Student = { id: string; firstName: string; lastName: string | null };
type Progress = MasteryTopic & { userId: string };

export default function TeacherMasteryClient() {
  const [batches, setBatches] = useState<Batch[]>([]);
  const [batchId, setBatchId] = useState('');
  const [students, setStudents] = useState<Student[]>([]);
  const [progress, setProgress] = useState<Progress[]>([]);
  const [loading, setLoading] = useState(false);
  useEffect(() => { fetch('/api/teacher/batches').then((response) => response.json()).then((rows) => { const list = Array.isArray(rows) ? rows : []; setBatches(list); if (list[0]) setBatchId(list[0].id); }); }, []);
  useEffect(() => { if (!batchId) return; setLoading(true); fetch(`/api/teacher/mastery?batchId=${encodeURIComponent(batchId)}`).then((response) => response.json()).then((data) => { setStudents(data.students || []); setProgress(data.progress || []); }).finally(() => setLoading(false)); }, [batchId]);
  const rows = useMemo(() => students.map((student) => { const topics = progress.filter((item) => item.userId === student.id); return { student, topics, summary: masterySummary(topics) }; }), [students, progress]);
  return <main className="min-h-screen bg-slate-50 dark:bg-background p-6 md:p-10"><div className="mx-auto max-w-6xl">
    <Link href="/teacher/dashboard" className="mb-6 inline-flex items-center gap-2 text-sm font-bold text-indigo-700 dark:text-brand"><ArrowLeft className="h-4 w-4" />Teacher dashboard</Link>
    <div className="mb-8 flex flex-wrap items-end justify-between gap-4"><div className="flex items-center gap-3"><Users className="h-9 w-9 text-indigo-600 dark:text-brand" /><div><h1 className="font-display text-3xl font-black text-slate-900 dark:text-white">Student mastery</h1><p className="text-slate-600 dark:text-slate-400">Identify weak topics and students who need support.</p></div></div><label className="text-xs font-black uppercase text-slate-500 dark:text-slate-400">Batch<select value={batchId} onChange={(event) => setBatchId(event.target.value)} className="mt-1 block min-w-64 rounded-xl border dark:border-white/10 bg-white dark:bg-surface p-3 text-sm font-bold normal-case text-slate-900 dark:text-white"><option value="">Select a batch</option>{batches.map((batch) => <option key={batch.id} value={batch.id}>{batch.name}</option>)}</select></label></div>
    {!batchId ? <div className="rounded-3xl border border-dashed dark:border-white/10 bg-white dark:bg-surface p-16 text-center font-bold text-slate-600 dark:text-slate-400">Create or select a batch to view mastery.</div> : loading ? <Loader2 className="mx-auto my-20 h-8 w-8 animate-spin text-indigo-600 dark:text-brand" /> : rows.length === 0 ? <div className="rounded-3xl border border-dashed dark:border-white/10 bg-white dark:bg-surface p-16 text-center font-bold text-slate-600 dark:text-slate-400">No approved students or mastery activity in this batch yet.</div> : <div className="overflow-hidden rounded-3xl border dark:border-white/10 bg-white dark:bg-surface"><div className="overflow-x-auto"><table className="w-full text-left"><thead className="bg-slate-100 dark:bg-white/5 text-xs font-black uppercase text-slate-500 dark:text-slate-400"><tr><th className="p-4">Student</th><th className="p-4">Average</th><th className="p-4">Needs support</th><th className="p-4">Developing</th><th className="p-4">Secure</th><th className="p-4">Priority topics</th></tr></thead><tbody className="divide-y dark:divide-white/10">{rows.map(({ student, summary }) => <tr key={student.id}><td className="p-4 font-black dark:text-white">{student.firstName} {student.lastName}</td><td className="p-4 font-bold dark:text-slate-200">{summary.average}%</td><td className="p-4 font-bold text-rose-600 dark:text-rose-400">{summary.needsSupport.length}</td><td className="p-4 font-bold text-amber-600 dark:text-amber-400">{summary.developing.length}</td><td className="p-4 font-bold text-emerald-600 dark:text-emerald-400">{summary.secure.length}</td><td className="p-4 text-sm text-slate-600 dark:text-slate-400">{summary.needsSupport.slice(0, 3).map((item) => item.topic).join(', ') || 'No urgent gaps'}</td></tr>)}</tbody></table></div></div>}
  </div></main>;
}
