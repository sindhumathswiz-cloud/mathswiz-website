'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, ChevronRight, Flame, Loader2, TrendingDown } from 'lucide-react';
import MathRenderer from '@/components/MathRenderer';

type Batch = { id: string; name: string };
type TopicHeat = { topic: string; avgMastery: number; studentCount: number };
type WrongAnswerQ = {
  questionId: string; content: string; topic: string | null; correctAnswer: string | null;
  wrongOptionBreakdown: { option: string; count: number }[]; totalWrong: number;
};
type AtRiskStudent = { id: string; firstName: string | null; lastName: string | null; weakTopicCount: number; avgMasteryAcrossWeakTopics: number };

function heatColor(avgMastery: number): string {
  if (avgMastery < 40) return 'bg-rose-500';
  if (avgMastery < 70) return 'bg-amber-500';
  return 'bg-emerald-500';
}

export default function TeacherHeatmapPage() {
  const [batches, setBatches] = useState<Batch[]>([]);
  const [batchId, setBatchId] = useState('');
  const [topics, setTopics] = useState<TopicHeat[]>([]);
  const [wrongAnswers, setWrongAnswers] = useState<WrongAnswerQ[]>([]);
  const [atRisk, setAtRisk] = useState<AtRiskStudent[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetch('/api/teacher/batches').then((r) => r.json()).then((data) => {
      const list = Array.isArray(data) ? data : [];
      setBatches(list);
      if (list.length > 0) setBatchId(list[0].id);
    });
  }, []);

  useEffect(() => {
    if (!batchId) return;
    setLoading(true);
    Promise.all([
      fetch(`/api/teacher/heatmap/topics?batchId=${batchId}`).then((r) => r.json()),
      fetch(`/api/teacher/heatmap/wrong-answers?batchId=${batchId}`).then((r) => r.json()),
      fetch(`/api/teacher/heatmap/students-at-risk?batchId=${batchId}`).then((r) => r.json()),
    ]).then(([t, w, s]) => {
      setTopics(t.topics || []);
      setWrongAnswers(w.questions || []);
      setAtRisk(s.students || []);
    }).finally(() => setLoading(false));
  }, [batchId]);

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-background">
      <div className="bg-white dark:bg-surface border-b border-slate-200 dark:border-white/10 px-8 py-6">
        <div className="max-w-6xl mx-auto">
          <div className="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400 mb-2 font-medium">
            <Link href="/teacher/dashboard" className="hover:text-indigo-600 dark:hover:text-brand transition-colors">Dashboard</Link>
            <ChevronRight className="w-4 h-4" />
            <span className="text-slate-800 dark:text-white">Class Heatmap</span>
          </div>
          <div className="flex items-center justify-between">
            <div>
              <h1 className="font-display text-3xl font-black text-slate-900 dark:text-white flex items-center gap-2"><Flame className="w-7 h-7 text-rose-500 dark:text-rose-400" /> Class Heatmap</h1>
              <p className="text-slate-500 dark:text-slate-400 mt-1">Weak topics, common wrong answers, and students who need support.</p>
            </div>
            <select value={batchId} onChange={(e) => setBatchId(e.target.value)} className="border dark:border-white/10 bg-white dark:bg-surface dark:text-white rounded-lg px-4 py-2.5 text-sm font-bold outline-none focus:border-indigo-400 dark:focus:border-brand">
              {batches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-8 py-8">
        {loading ? (
          <Loader2 className="w-10 h-10 text-indigo-500 dark:text-brand animate-spin mx-auto my-16" />
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 bg-white dark:bg-surface rounded-2xl border border-slate-200 dark:border-white/10 shadow-sm p-6">
              <h2 className="font-display text-lg font-black text-slate-800 dark:text-white mb-4">Topic mastery heat grid</h2>
              {topics.length === 0 ? (
                <p className="text-sm text-slate-400 dark:text-slate-500">No mastery data yet for this batch.</p>
              ) : (
                <div className="space-y-3">
                  {topics.map((t) => (
                    <div key={t.topic}>
                      <div className="flex justify-between text-sm font-bold mb-1 dark:text-slate-200">
                        <span>{t.topic}</span>
                        <span className="text-slate-400 dark:text-slate-500">{t.avgMastery}% · {t.studentCount} rows</span>
                      </div>
                      <div className="h-3 rounded-full bg-slate-100 dark:bg-white/10 overflow-hidden">
                        <div className={`h-full ${heatColor(t.avgMastery)}`} style={{ width: `${t.avgMastery}%` }} />
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <h2 className="font-display text-lg font-black text-slate-800 dark:text-white mt-8 mb-4 flex items-center gap-2"><TrendingDown className="w-5 h-5 text-rose-500 dark:text-rose-400" /> Common wrong answers</h2>
              {wrongAnswers.length === 0 ? (
                <p className="text-sm text-slate-400 dark:text-slate-500">No incorrect responses recorded yet.</p>
              ) : (
                <div className="space-y-4">
                  {wrongAnswers.slice(0, 10).map((q) => (
                    <div key={q.questionId} className="border dark:border-white/10 rounded-xl p-4">
                      <div className="text-sm mb-2 dark:text-slate-200"><MathRenderer content={q.content} /></div>
                      <div className="flex flex-wrap gap-2 text-xs font-bold">
                        {q.wrongOptionBreakdown.map((o) => (
                          <span key={o.option} className="bg-rose-50 dark:bg-rose-500/10 text-rose-700 dark:text-rose-400 px-2 py-1 rounded-lg">
                            Chose {o.option} × {o.count}
                          </span>
                        ))}
                        {q.correctAnswer && <span className="bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 px-2 py-1 rounded-lg">Correct: {q.correctAnswer}</span>}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="bg-white dark:bg-surface rounded-2xl border border-slate-200 dark:border-white/10 shadow-sm p-6 h-fit">
              <h2 className="font-display text-lg font-black text-slate-800 dark:text-white mb-4 flex items-center gap-2"><AlertTriangle className="w-5 h-5 text-amber-500 dark:text-amber-400" /> Students needing support</h2>
              {atRisk.length === 0 ? (
                <p className="text-sm text-slate-400 dark:text-slate-500">No students below the mastery threshold right now.</p>
              ) : (
                <div className="space-y-3">
                  {atRisk.map((s) => (
                    <div key={s.id} className="border dark:border-white/10 rounded-lg p-3">
                      <p className="font-bold text-sm text-slate-800 dark:text-white">{s.firstName} {s.lastName}</p>
                      <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">{s.weakTopicCount} weak topic{s.weakTopicCount === 1 ? '' : 's'} · avg {s.avgMasteryAcrossWeakTopics}%</p>
                      <Link href="/teacher/interventions" className="text-xs font-black text-indigo-600 dark:text-brand mt-2 inline-block hover:underline">
                        Assign support →
                      </Link>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
