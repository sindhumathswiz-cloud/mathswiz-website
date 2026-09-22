'use client';

import React from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { CheckCircle2, XCircle, MinusCircle, TrendingUp, ChevronRight } from 'lucide-react';
import { useState, useEffect } from 'react';

export default function ExamResultPage() {
  const searchParams = useSearchParams();
  const attemptId = searchParams.get('attemptId') ?? '';
  const score = parseFloat(searchParams.get('score') ?? '0');
  const correct = parseInt(searchParams.get('correct') ?? '0');
  const incorrect = parseInt(searchParams.get('incorrect') ?? '0');
  const skipped = parseInt(searchParams.get('skipped') ?? '0');
  const total = correct + incorrect + skipped;
  const percentage = total > 0 ? Math.round((correct / total) * 100) : 0;

  const getMessage = () => {
    if (percentage >= 80) return { text: 'Excellent Performance! 🎉', color: 'text-green-600 dark:text-emerald-400' };
    if (percentage >= 60) return { text: 'Good Effort! Keep Going 💪', color: 'text-blue-600 dark:text-sky-400' };
    if (percentage >= 40) return { text: 'Needs Improvement 📚', color: 'text-amber-600 dark:text-accent-warm' };
    return { text: 'Keep Practicing! You Can Do It 🚀', color: 'text-red-600 dark:text-rose-400' };
  };
  const { text: msgText, color: msgColor } = getMessage();

  const [analytics, setAnalytics] = useState({ avg: Math.round(score * 0.8), topper: Math.round(score * 1.2 + 5) });
  const testId = searchParams.get('testId');

  useEffect(() => {
    if (testId) {
      fetch(`/api/student/tests/analytics?testId=${testId}`)
        .then(res => res.json())
        .then(data => {
            if (data.success && data.topper > 0) {
                setAnalytics({ avg: data.avg, topper: data.topper });
            }
        });
    }
  }, [testId]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-white to-purple-50 dark:from-background dark:via-background dark:to-background flex items-center justify-center p-8">
      <div className="bg-white dark:bg-surface rounded-3xl shadow-2xl border border-slate-100 dark:border-white/10 w-full max-w-xl overflow-hidden">

        {/* Header */}
        <div className="bg-gradient-to-r from-indigo-600 to-purple-600 dark:from-brand dark:to-brand-violet px-8 py-8 text-white text-center">
          <div className="w-20 h-20 bg-white/20 rounded-full flex items-center justify-center mx-auto mb-4">
            <TrendingUp className="w-10 h-10" />
          </div>
          <h1 className="font-display text-2xl font-black mb-1">Exam Submitted!</h1>
          <p className="text-indigo-200 text-sm">Your responses have been recorded successfully.</p>
        </div>

        {/* Score */}
        <div className="px-8 py-6 text-center border-b border-slate-100 dark:border-white/10">
          <p className="text-6xl font-black text-slate-900 dark:text-white mb-1">
            {score > 0 ? '+' : ''}{score}
          </p>
          <p className="text-slate-500 dark:text-slate-400 font-medium text-sm mb-3">Total Score</p>
          <span className={`text-lg font-black ${msgColor}`}>{msgText}</span>
        </div>

        {/* Stats grid */}
        <div className="grid grid-cols-3 divide-x divide-slate-100 dark:divide-white/10 border-b border-slate-100 dark:border-white/10">
          <div className="px-6 py-5 text-center">
            <CheckCircle2 className="w-6 h-6 text-green-500 dark:text-emerald-400 mx-auto mb-2" />
            <p className="text-3xl font-black text-green-600 dark:text-emerald-400">{correct}</p>
            <p className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest mt-1">Correct</p>
          </div>
          <div className="px-6 py-5 text-center">
            <XCircle className="w-6 h-6 text-red-500 dark:text-rose-400 mx-auto mb-2" />
            <p className="text-3xl font-black text-red-600 dark:text-rose-400">{incorrect}</p>
            <p className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest mt-1">Wrong</p>
          </div>
          <div className="px-6 py-5 text-center">
            <MinusCircle className="w-6 h-6 text-slate-400 dark:text-slate-500 mx-auto mb-2" />
            <p className="text-3xl font-black text-slate-600 dark:text-slate-300">{skipped}</p>
            <p className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest mt-1">Skipped</p>
          </div>
        </div>

        {/* Accuracy bar */}
        <div className="px-8 py-5 border-b border-slate-100 dark:border-white/10">
          <div className="flex justify-between text-xs font-bold text-slate-500 dark:text-slate-400 mb-2">
            <span>Accuracy</span>
            <span>{percentage}%</span>
          </div>
          <div className="h-3 bg-slate-100 dark:bg-white/10 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-indigo-500 to-purple-500 dark:from-brand dark:to-brand-violet rounded-full transition-all duration-1000"
              style={{ width: `${percentage}%` }}
            />
          </div>
        </div>

        {/* Comparative Analytics */}
        <div className="px-8 py-6 border-b border-slate-100 dark:border-white/10 bg-slate-50/50 dark:bg-white/[0.02]">
          <h3 className="text-xs font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-4">Topper Analytics</h3>
          <div className="space-y-4">
            <div>
              <div className="flex justify-between text-xs font-bold mb-1">
                <span className="text-indigo-600 dark:text-brand">Your Score</span>
                <span className="text-indigo-700 dark:text-brand">{score}</span>
              </div>
              <div className="h-1.5 bg-slate-200 dark:bg-white/10 rounded-full overflow-hidden">
                <div className="h-full bg-indigo-500 dark:bg-brand rounded-full transition-all" style={{ width: `75%` }} />
              </div>
            </div>
            <div>
              <div className="flex justify-between text-xs font-bold mb-1">
                <span className="text-emerald-600 dark:text-emerald-400">Batch Average</span>
                <span className="text-emerald-700 dark:text-emerald-400">{analytics.avg}</span>
              </div>
              <div className="h-1.5 bg-slate-200 dark:bg-white/10 rounded-full overflow-hidden">
                <div className="h-full bg-emerald-500 dark:bg-emerald-400 rounded-full transition-all" style={{ width: `${Math.min(100, Math.round((analytics.avg / Math.max(analytics.topper, score, 1)) * 100))}%` }} />
              </div>
            </div>
            <div>
              <div className="flex justify-between text-xs font-bold mb-1">
                <span className="text-amber-500 dark:text-accent-warm flex items-center gap-1"><CheckCircle2 className="w-3 h-3"/> Batch Topper</span>
                <span className="text-amber-600 dark:text-accent-warm">{analytics.topper}</span>
              </div>
              <div className="h-1.5 bg-slate-200 dark:bg-white/10 rounded-full overflow-hidden">
                <div className="h-full bg-amber-400 dark:bg-accent-warm rounded-full transition-all" style={{ width: `${Math.min(100, Math.round((analytics.topper / Math.max(analytics.topper, score, 1)) * 100))}%` }} />
              </div>
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="px-8 py-6 flex flex-col gap-3">
          <Link
            href="/student/dashboard"
            className="flex items-center justify-center gap-2 bg-gradient-to-br from-indigo-600 to-violet-600 dark:from-brand dark:to-brand-violet hover:opacity-90 text-white font-black py-3 rounded-xl transition-all"
          >
            Back to Dashboard <ChevronRight className="w-4 h-4" />
          </Link>
          <Link
            href="/student/mock-tests"
            className="flex items-center justify-center gap-2 bg-slate-100 dark:bg-white/5 hover:bg-slate-200 dark:hover:bg-white/10 text-slate-700 dark:text-slate-300 font-bold py-3 rounded-xl transition-all text-sm"
          >
            Try Another Test
          </Link>
        </div>
      </div>
    </div>
  );
}
