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
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <div className="bg-white border-b border-slate-200 px-8 py-6">
        <div className="max-w-7xl mx-auto flex justify-between items-start">
          <div>
            <div className="flex items-center gap-2 text-sm text-slate-500 mb-2 font-medium">
              <Link href="/teacher/dashboard" className="hover:text-indigo-600 transition-colors">Dashboard</Link>
              <ChevronRight className="w-4 h-4" />
              <span className="text-slate-800">Test Ledger</span>
            </div>
            <h1 className="text-3xl font-black text-slate-900">Test & Exam Ledger</h1>
            <p className="text-slate-500 mt-1">Manage all your assembled tests and assignments.</p>
          </div>
          <Link
            href="/teacher/tests/create"
            className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white px-5 py-3 rounded-xl font-bold shadow-lg shadow-indigo-900/20 transition-all"
          >
            <Plus className="w-4 h-4" /> Create New Test
          </Link>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-8 py-8">
        {/* KPI Summary Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          {[
            { label: 'Total Tests', value: tests.length, icon: <FileText className="w-5 h-5 text-indigo-500" />, bg: 'bg-indigo-50', text: 'text-indigo-700' },
            { label: 'Published', value: published, icon: <CheckCircle2 className="w-5 h-5 text-emerald-500" />, bg: 'bg-emerald-50', text: 'text-emerald-700' },
            { label: 'Total Questions', value: totalQuestions, icon: <BookOpen className="w-5 h-5 text-purple-500" />, bg: 'bg-purple-50', text: 'text-purple-700' },
            { label: 'Total Marks', value: totalMarks, icon: <Zap className="w-5 h-5 text-amber-500" />, bg: 'bg-amber-50', text: 'text-amber-700' },
          ].map(card => (
            <div key={card.label} className={`${card.bg} rounded-2xl p-5 border border-white/60 shadow-sm`}>
              <div className="flex items-center gap-2 mb-2">
                {card.icon}
                <span className={`text-xs font-bold uppercase tracking-widest ${card.text}`}>{card.label}</span>
              </div>
              <p className="text-3xl font-black text-slate-900">{card.value}</p>
            </div>
          ))}
        </div>

        {/* Live vs. Template view toggle */}
        <div className="flex gap-2 mb-6">
          <button onClick={() => setView('live')} className={`px-4 py-2 rounded-lg text-sm font-bold ${view === 'live' ? 'bg-indigo-600 text-white' : 'bg-white border text-slate-600'}`}>
            Live tests &amp; homework
          </button>
          <button onClick={() => setView('templates')} className={`px-4 py-2 rounded-lg text-sm font-bold ${view === 'templates' ? 'bg-indigo-600 text-white' : 'bg-white border text-slate-600'}`}>
            Reusable templates
          </button>
        </div>

        {/* Test List */}
        {isLoading ? (
          <div className="flex items-center justify-center h-64">
            <Loader2 className="w-10 h-10 text-indigo-500 animate-spin" />
          </div>
        ) : visibleTests.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 border-2 border-dashed border-slate-300 rounded-2xl bg-white">
            <FileText className="w-14 h-14 text-slate-300 mb-4" />
            <p className="text-slate-500 font-bold text-lg">{view === 'templates' ? 'No reusable templates yet' : 'No tests yet'}</p>
            <p className="text-slate-400 text-sm mb-6">{view === 'templates' ? 'Save a test as a template (Worksheet, Revision Pack, Mock Exam, or Homework Template) to see it here.' : 'Create your first test using the Test Creator Studio.'}</p>
            <Link href="/teacher/tests/create" className="bg-indigo-600 hover:bg-indigo-500 text-white px-6 py-2.5 rounded-xl font-bold transition-all">
              + Create a Test
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
            {visibleTests.map(test => (
              <div key={test.id} className="bg-white rounded-2xl border border-slate-200 shadow-sm hover:shadow-md hover:border-indigo-300 transition-all p-6 flex flex-col">
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <span className={`text-[10px] font-black uppercase tracking-widest px-2.5 py-1 rounded-lg mr-2 ${test.mode === 'STRICT' ? 'bg-red-100 text-red-700' : 'bg-emerald-100 text-emerald-700'}`}>
                      {test.mode}
                    </span>
                    {test.templateType && (
                      <span className="text-[10px] font-black uppercase tracking-widest px-2.5 py-1 rounded-lg bg-purple-100 text-purple-700 mr-2">
                        {TEMPLATE_LABELS[test.templateType] || test.templateType}
                      </span>
                    )}
                    {test.isPublished && (
                      <span className="text-[10px] font-black uppercase tracking-widest px-2.5 py-1 rounded-lg bg-indigo-100 text-indigo-700">
                        Published
                      </span>
                    )}
                  </div>
                  <span className="text-xs text-slate-400 font-medium">
                    {new Date(test.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                  </span>
                </div>

                <h3 className="text-lg font-black text-slate-900 mb-1 leading-tight">{test.title}</h3>
                {test.description && (
                  <p className="text-sm text-slate-500 mb-3 line-clamp-2">{test.description}</p>
                )}

                <div className="flex items-center gap-4 mt-auto pt-4 border-t border-slate-100 text-xs font-bold text-slate-500">
                  <span className="flex items-center gap-1"><Layers className="w-3.5 h-3.5" />{test.sectionCount} sections</span>
                  <span className="flex items-center gap-1"><BookOpen className="w-3.5 h-3.5" />{test.questionCount} Qs</span>
                  <span className="flex items-center gap-1"><Clock className="w-3.5 h-3.5" />{test.duration} mins</span>
                  <span className="ml-auto text-indigo-600">{test.totalMarks} marks</span>
                </div>
                <div className="mt-3 flex gap-2">
                  <Link
                    href={`/teacher/tests/${test.id}/assign`}
                    className="flex-1 text-center bg-slate-100 hover:bg-indigo-50 hover:text-indigo-700 text-slate-600 px-4 py-2 rounded-lg text-xs font-black uppercase tracking-widest transition-colors"
                  >
                    Publish &amp; Assign
                  </Link>
                  <button
                    onClick={() => duplicateTest(test.id)}
                    disabled={duplicatingId === test.id}
                    title="Duplicate as a new, independent test"
                    className="shrink-0 flex items-center justify-center bg-slate-100 hover:bg-purple-50 hover:text-purple-700 text-slate-600 px-3 py-2 rounded-lg transition-colors disabled:opacity-50"
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
