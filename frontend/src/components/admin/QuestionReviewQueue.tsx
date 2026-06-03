'use client';

import React, { useState, useEffect } from 'react';
import { Clock, CheckCircle, XCircle, Eye, Loader2, ChevronDown, ChevronUp, Filter, User, BookOpen, AlertCircle } from 'lucide-react';
import toast from 'react-hot-toast';
import MathRenderer from '@/components/MathRenderer';

interface ReviewQuestion {
  id: string;
  content: string;
  options: string[];
  correctAnswer: string;
  explanation: string;
  type: string;
  difficulty: string;
  subject: string;
  class: string;
  topic: string | null;
  status: string;
  scope: string;
  createdAt: string;
  createdBy: {
    firstName: string;
    lastName: string;
    role: string;
  };
}

export function QuestionReviewQueue({ initialQuestions = [] }: { initialQuestions?: ReviewQuestion[] }) {
  const [questions, setQuestions] = useState<ReviewQuestion[]>(initialQuestions);
  const [loading, setLoading] = useState(!initialQuestions.length);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [reviewNotes, setReviewNotes] = useState<Record<string, string>>({});
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [filterSubject, setFilterSubject] = useState('All');
  const [filterClass, setFilterClass] = useState('All');
  const [stats, setStats] = useState({ total: 0, today: 0 });

  useEffect(() => {
    if (!initialQuestions.length) {
      fetchQuestions();
    }
    setStats({
      total: initialQuestions.length,
      today: initialQuestions.filter(q => {
        const d = new Date(q.createdAt);
        const now = new Date();
        return d.toDateString() === now.toDateString();
      }).length,
    });
  }, [initialQuestions]);

  const fetchQuestions = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/questions?status=PENDING_REVIEW');
      const data = await res.json();
      if (data.questions) {
        setQuestions(data.questions);
      }
    } catch (e) {
      toast.error('Failed to fetch questions for review');
    } finally {
      setLoading(false);
    }
  };

  const handleReview = async (questionId: string, action: 'APPROVE' | 'REJECT') => {
    setProcessingId(questionId);
    try {
      const res = await fetch('/api/admin/questions/review', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          questionId,
          action,
          reviewNotes: reviewNotes[questionId] || '',
        }),
      });
      const data = await res.json();

      if (data.success) {
        toast.success(action === 'APPROVE' ? 'Question approved and added to public bank!' : 'Question rejected');
        setQuestions(prev => prev.filter(q => q.id !== questionId));
        setExpandedId(null);
      } else {
        toast.error(data.error || 'Review action failed');
      }
    } catch (e) {
      toast.error('Network error during review');
    } finally {
      setProcessingId(null);
    }
  };

  const subjects = ['All', ...Array.from(new Set(questions.map(q => q.subject).filter(Boolean)))];
  const classes = ['All', ...Array.from(new Set(questions.map(q => q.class).filter(Boolean)))];

  const filtered = questions.filter(q => {
    if (filterSubject !== 'All' && q.subject !== filterSubject) return false;
    if (filterClass !== 'All' && q.class !== filterClass) return false;
    return true;
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center p-12">
        <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
        <span className="ml-3 text-gray-500 font-medium">Loading review queue...</span>
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-in fade-in duration-300">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Question Review Queue</h2>
          <p className="text-sm text-gray-500 mt-1">Review and approve questions submitted by teachers.</p>
        </div>
        <button onClick={fetchQuestions} className="flex items-center gap-2 px-4 py-2 bg-gray-100 rounded-lg font-bold text-sm hover:bg-gray-200">
          <Clock className="w-4 h-4" /> Refresh
        </button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white p-5 rounded-xl border border-gray-200 flex items-center gap-4">
          <div className="p-3 bg-amber-50 text-amber-600 rounded-xl">
            <Clock className="w-6 h-6" />
          </div>
          <div>
            <p className="text-xs font-black text-gray-400 uppercase tracking-widest">Pending Review</p>
            <p className="text-2xl font-black text-gray-900">{questions.length}</p>
          </div>
        </div>
        <div className="bg-white p-5 rounded-xl border border-gray-200 flex items-center gap-4">
          <div className="p-3 bg-emerald-50 text-emerald-600 rounded-xl">
            <CheckCircle className="w-6 h-6" />
          </div>
          <div>
            <p className="text-xs font-black text-gray-400 uppercase tracking-widest">Approved Today</p>
            <p className="text-2xl font-black text-gray-900">{stats.today}</p>
          </div>
        </div>
        <div className="bg-white p-5 rounded-xl border border-gray-200 flex items-center gap-4">
          <div className="p-3 bg-blue-50 text-blue-600 rounded-xl">
            <User className="w-6 h-6" />
          </div>
          <div>
            <p className="text-xs font-black text-gray-400 uppercase tracking-widest">Contributing Teachers</p>
            <p className="text-2xl font-black text-gray-900">{new Set(questions.map(q => `${q.createdBy?.firstName}-${q.createdBy?.lastName}`)).size}</p>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white p-4 rounded-xl border border-gray-200 flex flex-wrap gap-4 items-center">
        <Filter className="w-4 h-4 text-gray-400" />
        <select
          value={filterSubject}
          onChange={(e) => setFilterSubject(e.target.value)}
          className="px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm font-medium outline-none focus:ring-2 focus:ring-indigo-500"
        >
          {subjects.map(s => <option key={s} value={s}>{s === 'All' ? 'All Subjects' : s}</option>)}
        </select>
        <select
          value={filterClass}
          onChange={(e) => setFilterClass(e.target.value)}
          className="px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm font-medium outline-none focus:ring-2 focus:ring-indigo-500"
        >
          {classes.map(c => <option key={c} value={c}>{c === 'All' ? 'All Classes' : c}</option>)}
        </select>
        <span className="text-sm text-gray-500 ml-auto">{filtered.length} questions shown</span>
      </div>

      {/* Question List */}
      {filtered.length === 0 ? (
        <div className="bg-white p-12 rounded-xl border text-center">
          <CheckCircle className="w-16 h-16 text-emerald-300 mx-auto mb-4" />
          <h3 className="text-lg font-bold text-gray-700">Review queue is empty!</h3>
          <p className="text-gray-500 mt-1">No teacher questions pending approval.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {filtered.map((q) => (
            <div key={q.id} className="bg-white rounded-xl border border-gray-200 overflow-hidden hover:shadow-md transition-shadow">
              {/* Summary Row */}
              <div
                onClick={() => setExpandedId(expandedId === q.id ? null : q.id)}
                className="p-4 flex items-center justify-between cursor-pointer hover:bg-gray-50"
              >
                <div className="flex items-center gap-4 flex-1">
                  <div className="w-10 h-10 bg-indigo-100 rounded-lg flex items-center justify-center text-indigo-600">
                    <BookOpen className="w-5 h-5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-gray-900 truncate">
                      <MathRenderer content={q.content} />
                    </p>
                    <div className="flex items-center gap-2 mt-1">
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                        q.difficulty === 'HARD' ? 'bg-red-100 text-red-700' :
                        q.difficulty === 'MEDIUM' ? 'bg-amber-100 text-amber-700' :
                        'bg-emerald-100 text-emerald-700'
                      }`}>{q.difficulty}</span>
                      <span className="px-2 py-0.5 bg-gray-100 text-gray-600 rounded-full text-[10px] font-bold">{q.subject}</span>
                      <span className="px-2 py-0.5 bg-gray-100 text-gray-600 rounded-full text-[10px] font-bold">{q.class}</span>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="text-right">
                    <p className="text-xs font-bold text-gray-700">{q.createdBy?.firstName} {q.createdBy?.lastName}</p>
                    <p className="text-[10px] text-gray-400">{new Date(q.createdAt).toLocaleDateString()}</p>
                  </div>
                  {expandedId === q.id ? <ChevronUp className="w-5 h-5 text-gray-400" /> : <ChevronDown className="w-5 h-5 text-gray-400" />}
                </div>
              </div>

              {/* Expanded Detail */}
              {expandedId === q.id && (
                <div className="p-6 bg-gray-50 border-t border-gray-200 space-y-6">
                  {/* Question Display */}
                  <div className="bg-white p-6 rounded-xl border border-gray-200">
                    <h4 className="text-sm font-black text-gray-500 uppercase tracking-widest mb-3">Question</h4>
                    <div className="prose max-w-none text-gray-900 text-lg mb-6">
                      <MathRenderer content={q.content} />
                    </div>
                    {q.options && q.options.length > 0 && (
                      <div className="grid grid-cols-2 gap-3">
                        {q.options.map((opt: string, idx: number) => (
                          <div key={idx} className={`p-3 rounded-lg border-2 text-sm ${q.correctAnswer === String.fromCharCode(65 + idx) ? 'border-emerald-500 bg-emerald-50' : 'border-gray-200'}`}>
                            <span className="font-bold mr-2">{String.fromCharCode(65 + idx)}.</span>
                            <MathRenderer content={opt} />
                          </div>
                        ))}
                      </div>
                    )}
                    {q.explanation && (
                      <div className="mt-4 p-4 bg-blue-50 rounded-lg border border-blue-200">
                        <p className="text-xs font-black text-blue-600 mb-1">Explanation:</p>
                        <MathRenderer content={q.explanation} />
                      </div>
                    )}
                  </div>

                  {/* Review Actions */}
                  <div className="flex flex-wrap gap-4 items-end">
                    <div className="flex-1">
                      <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest ml-1">Review Notes (optional)</label>
                      <textarea
                        value={reviewNotes[q.id] || ''}
                        onChange={(e) => setReviewNotes(prev => ({ ...prev, [q.id]: e.target.value }))}
                        placeholder="Add notes for the teacher..."
                        className="w-full px-4 py-3 bg-white border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500 text-sm resize-none h-20"
                      />
                    </div>
                    <div className="flex gap-3">
                      <button
                        onClick={() => handleReview(q.id, 'REJECT')}
                        disabled={processingId === q.id}
                        className="px-6 py-3 bg-red-100 text-red-700 rounded-xl font-bold hover:bg-red-200 disabled:opacity-50 flex items-center gap-2"
                      >
                        {processingId === q.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <XCircle className="w-5 h-5" />}
                        Reject
                      </button>
                      <button
                        onClick={() => handleReview(q.id, 'APPROVE')}
                        disabled={processingId === q.id}
                        className="px-6 py-3 bg-emerald-600 text-white rounded-xl font-bold hover:bg-emerald-700 disabled:opacity-50 flex items-center gap-2"
                      >
                        {processingId === q.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-5 h-5" />}
                        Approve & Publish
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
