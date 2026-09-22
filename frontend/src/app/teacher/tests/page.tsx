'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { Plus, FileText, Clock, BookOpen, CheckCircle2, Loader2, ChevronRight, Layers, Zap, Copy } from 'lucide-react';

type TestSummary = {
  id: string;
  title: string;
  description?: string;
  mode: string;
  duration: number;
  totalMarks: number;
  isPublished: boolean;
  templateType: string | null;
  createdAt: string;
  sectionCount: number;
  questionCount: number;
};

const TEMPLATE_LABELS: Record<string, string> = {
  WORKSHEET: 'Worksheet',
  REVISION_PACK: 'Revision Pack',
  MOCK_EXAM: 'Mock Exam',
  HOMEWORK_TEMPLATE: 'Homework Template',
};

export default function TeacherTestsLedger() {
  const [tests, setTests] = useState<TestSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [view, setView] = useState<'live' | 'templates'>('live');
  const [duplicatingId, setDuplicatingId] = useState<string | null>(null);

  useEffect(() => {
    fetchTests();
  }, []);

  const fetchTests = async () => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/teacher/tests/list');
      const data = await res.json();
      setTests(data.tests || []);
    } catch (err) {
      console.error('Failed to load tests:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const duplicateTest = async (id: string) => {
    setDuplicatingId(id);
    try {
      const res = await fetch(`/api/teacher/tests/${id}/duplicate`, { method: 'POST' });
      if (res.ok) {
        await fetchTests();
      } else {
        const data = await res.json();
        alert(data.error || 'Could not duplicate test');
      }
    } finally {
      setDuplicatingId(null);
    }
  };

  const visibleTests = tests.filter(t => (view === 'templates' ? !!t.templateType : !t.templateType));
  const totalQuestions = tests.reduce((sum, t) => sum + t.questionCount, 0);
  const totalMarks = tests.reduce((sum, t) => sum + t.totalMarks, 0);
  const published = tests.filter(t => t.isPublished).length;

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-background">
      {/* Header */}
      <div className="bg-white dark:bg-surface border-b border-slate-200 dark:border-white/10 px-8 py-6">
        <div className="max-w-7xl mx-auto flex justify-between items-start">
          <div>
            <div className="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400 mb-2 font-medium">
              <Link href="/teacher/dashboard" className="hover:text-indigo-600 dark:hover:text-brand transition-colors">Dashboard</Link>
              <ChevronRight className="w-4 h-4" />
              <span className="text-slate-800 dark:text-white">Test Ledger</span>
            </div>
            <h1 className="font-display text-3xl font-black text-slate-900 dark:text-white">Test & Exam Ledger</h1>
            <p className="text-slate-500 dark:text-slate-400 mt-1">Manage all your assembled tests and assignments.</p>
          </div>
          <Link
            href="/teacher/tests/create"
            className="flex items-center gap-2 bg-gradient-to-br from-indigo-600 to-violet-600 dark:from-brand dark:to-brand-violet hover:opacity-90 text-white px-5 py-3 rounded-xl font-bold shadow-lg shadow-indigo-900/20 dark:shadow-none transition-all"
          >
            <Plus className="w-4 h-4" /> Create New Test
          </Link>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-8 py-8">
        {/* KPI Summary Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          {[
            { label: 'Total Tests', value: tests.length, icon: <FileText className="w-5 h-5 text-indigo-500 dark:text-brand" />, bg: 'bg-indigo-50 dark:bg-brand/10', text: 'text-indigo-700 dark:text-brand' },
            { label: 'Published', value: published, icon: <CheckCircle2 className="w-5 h-5 text-emerald-500 dark:text-emerald-400" />, bg: 'bg-emerald-50 dark:bg-emerald-500/10', text: 'text-emerald-700 dark:text-emerald-400' },
            { label: 'Total Questions', value: totalQuestions, icon: <BookOpen className="w-5 h-5 text-purple-500 dark:text-brand-violet" />, bg: 'bg-purple-50 dark:bg-brand-violet/10', text: 'text-purple-700 dark:text-brand-violet' },
            { label: 'Total Marks', value: totalMarks, icon: <Zap className="w-5 h-5 text-amber-500 dark:text-accent-warm" />, bg: 'bg-amber-50 dark:bg-accent-warm/10', text: 'text-amber-700 dark:text-accent-warm' },
          ].map(card => (
            <div key={card.label} className={`${card.bg} rounded-2xl p-5 border border-white/60 dark:border-white/10 shadow-sm`}>
              <div className="flex items-center gap-2 mb-2">
                {card.icon}
                <span className={`text-xs font-bold uppercase tracking-widest ${card.text}`}>{card.label}</span>
              </div>
              <p className="text-3xl font-black text-slate-900 dark:text-white">{card.value}</p>
            </div>
          ))}
        </div>

        {/* Live vs. Template view toggle */}
        <div className="flex gap-2 mb-6">
          <button onClick={() => setView('live')} className={`px-4 py-2 rounded-lg text-sm font-bold ${view === 'live' ? 'bg-gradient-to-br from-indigo-600 to-violet-600 dark:from-brand dark:to-brand-violet text-white' : 'bg-white dark:bg-surface border dark:border-white/10 text-slate-600 dark:text-slate-400'}`}>
            Live tests &amp; homework
          </button>
          <button onClick={() => setView('templates')} className={`px-4 py-2 rounded-lg text-sm font-bold ${view === 'templates' ? 'bg-gradient-to-br from-indigo-600 to-violet-600 dark:from-brand dark:to-brand-violet text-white' : 'bg-white dark:bg-surface border dark:border-white/10 text-slate-600 dark:text-slate-400'}`}>
            Reusable templates
          </button>
        </div>

        {/* Test List */}
        {isLoading ? (
          <div className="flex items-center justify-center h-64">
            <Loader2 className="w-10 h-10 text-indigo-500 dark:text-brand animate-spin" />
          </div>
        ) : visibleTests.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 border-2 border-dashed border-slate-300 dark:border-white/10 rounded-2xl bg-white dark:bg-surface">
            <FileText className="w-14 h-14 text-slate-300 dark:text-slate-600 mb-4" />
            <p className="text-slate-500 dark:text-slate-400 font-bold text-lg">{view === 'templates' ? 'No reusable templates yet' : 'No tests yet'}</p>
            <p className="text-slate-400 dark:text-slate-500 text-sm mb-6">{view === 'templates' ? 'Save a test as a template (Worksheet, Revision Pack, Mock Exam, or Homework Template) to see it here.' : 'Create your first test using the Test Creator Studio.'}</p>
            <Link href="/teacher/tests/create" className="bg-gradient-to-br from-indigo-600 to-violet-600 dark:from-brand dark:to-brand-violet hover:opacity-90 text-white px-6 py-2.5 rounded-xl font-bold transition-all">
              + Create a Test
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
            {visibleTests.map(test => (
              <div key={test.id} data-testid={`test-card-${test.id}`} className="bg-white dark:bg-surface rounded-2xl border border-slate-200 dark:border-white/10 shadow-sm hover:shadow-md hover:border-indigo-300 dark:hover:border-brand/40 transition-all p-6 flex flex-col">
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <span className={`text-[10px] font-black uppercase tracking-widest px-2.5 py-1 rounded-lg mr-2 ${test.mode === 'STRICT' ? 'bg-red-100 dark:bg-rose-500/10 text-red-700 dark:text-rose-400' : 'bg-emerald-100 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400'}`}>
                      {test.mode}
                    </span>
                    {test.templateType && (
                      <span className="text-[10px] font-black uppercase tracking-widest px-2.5 py-1 rounded-lg bg-purple-100 dark:bg-brand-violet/10 text-purple-700 dark:text-brand-violet mr-2">
                        {TEMPLATE_LABELS[test.templateType] || test.templateType}
                      </span>
                    )}
                    {test.isPublished && (
                      <span className="text-[10px] font-black uppercase tracking-widest px-2.5 py-1 rounded-lg bg-indigo-100 dark:bg-brand/10 text-indigo-700 dark:text-brand">
                        Published
                      </span>
                    )}
                  </div>
                  <span className="text-xs text-slate-400 dark:text-slate-500 font-medium">
                    {new Date(test.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                  </span>
                </div>

                <h3 className="font-display text-lg font-black text-slate-900 dark:text-white mb-1 leading-tight">{test.title}</h3>
                {test.description && (
                  <p className="text-sm text-slate-500 dark:text-slate-400 mb-3 line-clamp-2">{test.description}</p>
                )}

                <div className="flex items-center gap-4 mt-auto pt-4 border-t border-slate-100 dark:border-white/10 text-xs font-bold text-slate-500 dark:text-slate-400">
                  <span className="flex items-center gap-1"><Layers className="w-3.5 h-3.5" />{test.sectionCount} sections</span>
                  <span className="flex items-center gap-1"><BookOpen className="w-3.5 h-3.5" />{test.questionCount} Qs</span>
                  <span className="flex items-center gap-1"><Clock className="w-3.5 h-3.5" />{test.duration} mins</span>
                  <span className="ml-auto text-indigo-600 dark:text-brand">{test.totalMarks} marks</span>
                </div>
                <div className="mt-3 flex gap-2">
                  <Link
                    href={`/teacher/tests/${test.id}/assign`}
                    className="flex-1 text-center bg-slate-100 dark:bg-white/5 hover:bg-indigo-50 dark:hover:bg-brand/10 hover:text-indigo-700 dark:hover:text-brand text-slate-600 dark:text-slate-300 px-4 py-2 rounded-lg text-xs font-black uppercase tracking-widest transition-colors"
                  >
                    Publish &amp; Assign
                  </Link>
                  <button
                    onClick={() => duplicateTest(test.id)}
                    disabled={duplicatingId === test.id}
                    title="Duplicate as a new, independent test"
                    className="shrink-0 flex items-center justify-center bg-slate-100 dark:bg-white/5 hover:bg-purple-50 dark:hover:bg-brand-violet/10 hover:text-purple-700 dark:hover:text-brand-violet text-slate-600 dark:text-slate-300 px-3 py-2 rounded-lg transition-colors disabled:opacity-50"
                  >
                    {duplicatingId === test.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Copy className="w-4 h-4" />}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
