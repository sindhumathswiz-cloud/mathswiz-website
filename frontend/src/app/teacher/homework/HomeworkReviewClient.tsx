'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import toast from 'react-hot-toast';
import { ArrowLeft, CheckCircle2, ClipboardCheck, Loader2 } from 'lucide-react';

type Submission = {
  id: string;
  subjectiveText: string | null;
  subjectiveImage: string | null;
  marksAwarded: number;
  reviewStatus: 'PENDING' | 'REVIEWED';
  teacherFeedback: string | null;
  question: { content: string; explanation: string | null };
  attempt: { user: { firstName: string; lastName: string | null }; test: { title: string; totalMarks: number } };
};

export default function HomeworkReviewClient() {
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    const response = await fetch('/api/teacher/homework/submissions');
    const data = await response.json();
    setSubmissions(response.ok ? data.submissions : []);
    if (!response.ok) toast.error(data.error || 'Unable to load homework submissions');
    setLoading(false);
  };

  useEffect(() => { void load(); }, []);

  const review = async (event: React.FormEvent<HTMLFormElement>, id: string) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setSavingId(id);
    const response = await fetch(`/api/teacher/homework/submissions/${id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ marksAwarded: Number(form.get('marksAwarded')), teacherFeedback: form.get('teacherFeedback') }),
    });
    const data = await response.json();
    if (response.ok) { toast.success('Homework reviewed'); await load(); }
    else toast.error(data.error || 'Unable to save review');
    setSavingId(null);
  };

  return (
    <main className="min-h-screen bg-slate-50 dark:bg-background p-6 md:p-10">
      <div className="mx-auto max-w-5xl">
        <Link href="/teacher/dashboard" className="mb-6 inline-flex items-center gap-2 text-sm font-bold text-indigo-700 dark:text-brand"><ArrowLeft className="h-4 w-4" />Teacher dashboard</Link>
        <div className="mb-8 flex items-center gap-3"><ClipboardCheck className="h-8 w-8 text-indigo-600 dark:text-brand" /><div><h1 className="font-display text-3xl font-black text-slate-900 dark:text-white">Homework review</h1><p className="text-slate-600 dark:text-slate-400">Review written answers, award marks, and leave feedback.</p></div></div>
        {loading ? <div className="flex justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-indigo-600 dark:text-brand" /></div> : submissions.length === 0 ? (
          <div className="rounded-3xl border border-dashed border-slate-300 dark:border-white/10 bg-white dark:bg-surface p-16 text-center"><CheckCircle2 className="mx-auto mb-3 h-10 w-10 text-emerald-500 dark:text-emerald-400" /><p className="font-bold text-slate-700 dark:text-slate-300">No homework submissions awaiting review.</p></div>
        ) : <div className="space-y-6">{submissions.map((item) => (
          <article key={item.id} className="rounded-3xl border border-slate-200 dark:border-white/10 bg-white dark:bg-surface p-6 shadow-sm">
            <div className="mb-4 flex flex-wrap justify-between gap-2"><div><p className="text-xs font-black uppercase tracking-wider text-indigo-600 dark:text-brand">{item.attempt.test.title}</p><h2 className="font-display font-black text-slate-900 dark:text-white">{item.attempt.user.firstName} {item.attempt.user.lastName}</h2></div><span className={`rounded-full px-3 py-1 text-xs font-black ${item.reviewStatus === 'PENDING' ? 'bg-amber-100 text-amber-800 dark:bg-amber-500/10 dark:text-amber-400' : 'bg-emerald-100 text-emerald-800 dark:bg-emerald-500/10 dark:text-emerald-400'}`}>{item.reviewStatus}</span></div>
            <p className="mb-3 font-semibold text-slate-800 dark:text-slate-200">{item.question.content}</p>
            <div className="mb-5 rounded-2xl bg-slate-50 dark:bg-white/5 p-4 text-slate-700 dark:text-slate-300">{item.subjectiveText || 'Image submission'}{item.subjectiveImage && <a className="ml-2 font-bold text-indigo-700 dark:text-brand underline" href={item.subjectiveImage} target="_blank" rel="noreferrer">View image</a>}</div>
            <form onSubmit={(event) => review(event, item.id)} className="grid gap-4 md:grid-cols-[140px_1fr_auto] md:items-end">
              <label className="text-xs font-black uppercase text-slate-500 dark:text-slate-400">Marks<input name="marksAwarded" type="number" min="0" max="1000" step="0.5" required defaultValue={item.marksAwarded} className="mt-1 w-full rounded-xl border dark:border-white/10 dark:bg-white/5 p-3 text-base text-slate-900 dark:text-white" /></label>
              <label className="text-xs font-black uppercase text-slate-500 dark:text-slate-400">Feedback<textarea name="teacherFeedback" required maxLength={5000} defaultValue={item.teacherFeedback || ''} rows={2} className="mt-1 w-full rounded-xl border dark:border-white/10 dark:bg-white/5 p-3 text-sm font-medium normal-case text-slate-900 dark:text-white" /></label>
              <button disabled={savingId === item.id} className="rounded-xl bg-gradient-to-br from-indigo-600 to-violet-600 dark:from-brand dark:to-brand-violet px-5 py-3 font-black text-white disabled:opacity-50">{savingId === item.id ? 'Saving…' : 'Save review'}</button>
            </form>
          </article>
        ))}</div>}
      </div>
    </main>
  );
}
