'use client';

import React, { useState, useEffect } from 'react';
import { BookOpen, CheckCircle, AlertCircle, TrendingUp, Layers, Target, Award, GraduationCap, FileText, RefreshCw, ChevronRight, ArrowLeft, Search, X, Trash2 } from 'lucide-react';
import MathRenderer from '@/components/MathRenderer';
import toast from 'react-hot-toast';

interface QuestionStats {
  total: number;
  approved: number;
  pending: number;
  reported: number;
  draft: number;
  byClass: Record<string, number>;
  byTopic: Record<string, number>;
  bySubTopic: Record<string, number>;
  byType: Record<string, number>;
  byDifficulty: Record<string, number>;
  byExamType: Record<string, number>;
  recentCount: number;
}

interface Question {
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
  subTopic: string | null;
  examType: string | null;
  status: string;
  tags: string[];
  createdAt: string;
}

type DrillLevel = 'overview' | 'category' | 'questions';

export default function QuestionBankStats() {
  const [stats, setStats] = useState<QuestionStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [drillLevel, setDrillLevel] = useState<DrillLevel>('overview');
  const [drillCategory, setDrillCategory] = useState<string>('');
  const [drillFilter, setDrillFilter] = useState<string>('');
  const [questions, setQuestions] = useState<Question[]>([]);
  const [questionsLoading, setQuestionsLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedQuestion, setExpandedQuestion] = useState<string | null>(null);

  useEffect(() => {
    fetchStats();
  }, []);

  const fetchStats = async () => {
    try {
      const res = await fetch('/api/admin/questions/stats');
      const data = await res.json();
      if (data.success) setStats(data.stats);
    } catch (e) {
      console.error('Failed to fetch stats:', e);
    } finally {
      setLoading(false);
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchStats();
    setDrillLevel('overview');
    setDrillCategory('');
    setDrillFilter('');
    setRefreshing(false);
  };

  const fetchQuestions = async (filters: Record<string, string>) => {
    setQuestionsLoading(true);
    try {
      const params = new URLSearchParams();
      Object.entries(filters).forEach(([k, v]) => {
        if (v) params.set(k, v);
      });
      const res = await fetch(`/api/questions?${params.toString()}`);
      const data = await res.json();
      if (data.questions) setQuestions(data.questions);
    } catch (e) {
      console.error('Failed to fetch questions:', e);
    } finally {
      setQuestionsLoading(false);
    }
  };

  const handleDeleteQuestion = async (id: string) => {
    if (!confirm('Are you sure you want to delete this question? This action cannot be undone.')) return;
    try {
      const res = await fetch(`/api/questions/${id}`, { method: 'DELETE' });
      if (res.ok) {
        setQuestions(prev => prev.filter(q => q.id !== id));
        setExpandedQuestion(null);
        fetchStats();
        toast.success('Question deleted');
      } else {
        toast.error('Failed to delete question');
      }
    } catch (e) {
      toast.error('Delete failed');
    }
  };

  const handleCategoryClick = (category: string, filter: string) => {
    setDrillCategory(category);
    setDrillFilter(filter);
    setDrillLevel('category');
    fetchQuestions({ [filter]: category, status: 'APPROVED' });
  };

  const handleBack = () => {
    if (drillLevel === 'questions') {
      setDrillLevel('category');
      setExpandedQuestion(null);
    } else {
      setDrillLevel('overview');
      setDrillCategory('');
      setDrillFilter('');
    }
  };

  const filteredQuestions = questions.filter(q =>
    !searchQuery ||
    q.content.toLowerCase().includes(searchQuery.toLowerCase()) ||
    q.tags.some(t => t.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  if (loading) {
    return (
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="h-24 bg-gray-100 rounded-xl animate-pulse" />
        ))}
      </div>
    );
  }

  if (!stats) return null;

  const cards = [
    { label: 'Total Questions', value: stats.total, icon: BookOpen, color: 'text-blue-600', bg: 'bg-blue-50', border: 'border-blue-200', filter: {} as Record<string, string> },
    { label: 'Approved', value: stats.approved, icon: CheckCircle, color: 'text-emerald-600', bg: 'bg-emerald-50', border: 'border-emerald-200', filter: { status: 'APPROVED' } },
    { label: 'Pending Review', value: stats.pending, icon: AlertCircle, color: 'text-amber-600', bg: 'bg-amber-50', border: 'border-amber-200', filter: { status: 'PENDING_REVIEW' } },
    { label: 'Drafts', value: stats.draft || 0, icon: FileText, color: 'text-gray-600', bg: 'bg-gray-50', border: 'border-gray-200', filter: { status: 'DRAFT' } },
    { label: 'Added This Week', value: stats.recentCount, icon: TrendingUp, color: 'text-purple-600', bg: 'bg-purple-50', border: 'border-purple-200', filter: {} as Record<string, string> },
  ];

  const breakdowns = [
    { title: 'By Class', icon: GraduationCap, iconColor: 'text-indigo-600', data: stats.byClass, filter: 'class' },
    { title: 'By Type', icon: Target, iconColor: 'text-emerald-600', data: stats.byType, filter: 'type' },
    { title: 'By Difficulty', icon: Layers, iconColor: 'text-amber-600', data: stats.byDifficulty, filter: 'difficulty' },
    { title: 'By Topic/Chapter', icon: Award, iconColor: 'text-purple-600', data: stats.byTopic, filter: 'topic' },
    { title: 'By Sub-Topic', icon: FileText, iconColor: 'text-teal-600', data: stats.bySubTopic, filter: 'subTopic' },
    { title: 'By Exam Type', icon: GraduationCap, iconColor: 'text-orange-600', data: stats.byExamType, filter: 'examType' },
  ];

  const difficultyColors: Record<string, string> = {
    EASY: 'bg-green-100 text-green-700',
    MEDIUM: 'bg-yellow-100 text-yellow-700',
    HARD: 'bg-red-100 text-red-700',
  };

  const typeColors: Record<string, string> = {
    SINGLE_CHOICE: 'bg-blue-100 text-blue-700',
    MULTIPLE_CHOICE: 'bg-indigo-100 text-indigo-700',
    SUBJECTIVE: 'bg-gray-100 text-gray-700',
    INTEGER: 'bg-purple-100 text-purple-700',
    TRUE_FALSE: 'bg-teal-100 text-teal-700',
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          {drillLevel !== 'overview' && (
            <button onClick={handleBack} className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors">
              <ArrowLeft className="w-4 h-4 text-gray-600" />
            </button>
          )}
          <div>
            <h2 className="text-lg font-bold text-gray-800">
              {drillLevel === 'overview' ? 'Question Bank Analytics' :
               drillLevel === 'category' ? `${drillFilter}: ${drillCategory}` :
               `Questions (${filteredQuestions.length})`}
            </h2>
            {drillLevel !== 'overview' && (
              <p className="text-xs text-gray-500">
                {drillLevel === 'category' ? `Click any item to view questions` :
                 `Showing ${filteredQuestions.length} of ${questions.length} questions`}
              </p>
            )}
          </div>
        </div>
        <button
          onClick={handleRefresh}
          disabled={refreshing}
          className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-indigo-600 bg-indigo-50 hover:bg-indigo-100 rounded-lg transition-colors disabled:opacity-50"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {/* Search bar for questions view */}
      {drillLevel === 'questions' && (
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search questions by text or tags..."
            className="w-full pl-10 pr-4 py-2 text-sm border rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
          />
          {searchQuery && (
            <button onClick={() => setSearchQuery('')} className="absolute right-3 top-1/2 -translate-y-1/2">
              <X className="w-4 h-4 text-gray-400" />
            </button>
          )}
        </div>
      )}

      {/* Overview Cards */}
      {drillLevel === 'overview' && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          {cards.map(card => (
            <button
              key={card.label}
              onClick={() => {
                setDrillLevel('questions');
                fetchQuestions(card.filter);
              }}
              className={`${card.bg} ${card.border} border rounded-xl p-4 text-left hover:shadow-md transition-shadow`}
            >
              <div className="flex items-center gap-2 mb-2">
                <card.icon className={`w-4 h-4 ${card.color}`} />
                <span className="text-xs font-medium text-gray-600">{card.label}</span>
              </div>
              <p className={`text-2xl font-bold ${card.color}`}>{card.value}</p>
            </button>
          ))}
        </div>
      )}

      {/* Breakdown Grid */}
      {(drillLevel === 'overview' || drillLevel === 'category') && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {breakdowns.map(bd => (
            <div key={bd.title} className="bg-white rounded-xl border p-4">
              <h3 className="text-sm font-bold text-gray-700 mb-3 flex items-center gap-2">
                <bd.icon className={`w-4 h-4 ${bd.iconColor}`} /> {bd.title}
              </h3>
              <div className="space-y-1.5 max-h-64 overflow-y-auto">
                {Object.entries(bd.data).sort((a, b) => b[1] - a[1]).map(([key, count]) => (
                  <button
                    key={key}
                    onClick={() => {
                      handleCategoryClick(key, bd.filter);
                      setDrillLevel('questions');
                      fetchQuestions({ [bd.filter]: key, status: 'APPROVED' });
                    }}
                    className="w-full flex items-center justify-between p-2 rounded-lg hover:bg-gray-50 transition-colors text-left"
                  >
                    <span className="text-sm text-gray-600 truncate mr-2">
                      {bd.filter === 'difficulty' ? (
                        <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${difficultyColors[key] || 'bg-gray-100 text-gray-700'}`}>{key}</span>
                      ) : bd.filter === 'type' ? (
                        <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${typeColors[key] || 'bg-gray-100 text-gray-700'}`}>{key.replace(/_/g, ' ')}</span>
                      ) : key}
                    </span>
                    <div className="flex items-center gap-1">
                      <span className="text-sm font-bold text-gray-800 bg-gray-100 px-2 py-0.5 rounded-full">{count}</span>
                      <ChevronRight className="w-3 h-3 text-gray-400" />
                    </div>
                  </button>
                ))}
                {Object.keys(bd.data).length === 0 && (
                  <p className="text-xs text-gray-400 text-center py-4">No data yet</p>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Questions List */}
      {drillLevel === 'questions' && (
        <div className="space-y-3">
          {questionsLoading ? (
            <div className="grid grid-cols-1 gap-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="h-20 bg-gray-100 rounded-xl animate-pulse" />
              ))}
            </div>
          ) : filteredQuestions.length === 0 ? (
            <div className="text-center py-12 bg-white rounded-xl border">
              <BookOpen className="w-8 h-8 text-gray-300 mx-auto mb-2" />
              <p className="text-sm text-gray-500">No questions found</p>
            </div>
          ) : (
            filteredQuestions.map(q => (
              <div key={q.id} className="bg-white rounded-xl border hover:shadow-md transition-shadow">
                <button
                  onClick={() => setExpandedQuestion(expandedQuestion === q.id ? null : q.id)}
                  className="w-full p-4 text-left"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold uppercase ${typeColors[q.type] || 'bg-gray-100 text-gray-700'}`}>
                          {q.type.replace(/_/g, ' ')}
                        </span>
                        <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold uppercase ${difficultyColors[q.difficulty] || 'bg-gray-100 text-gray-700'}`}>
                          {q.difficulty}
                        </span>
                        {q.class && <span className="text-[10px] text-gray-500">{q.class}</span>}
                        {q.topic && <span className="text-[10px] text-gray-500">{q.topic}</span>}
                        <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold uppercase ${
                          q.status === 'APPROVED' ? 'bg-emerald-100 text-emerald-700' :
                          q.status === 'PENDING_REVIEW' ? 'bg-amber-100 text-amber-700' :
                          'bg-gray-100 text-gray-700'
                        }`}>
                          {q.status.replace(/_/g, ' ')}
                        </span>
                      </div>
                      <p className="text-sm text-gray-800 line-clamp-2">{q.content}</p>
                    </div>
                    <ChevronRight className={`w-4 h-4 text-gray-400 flex-shrink-0 mt-1 transition-transform ${expandedQuestion === q.id ? 'rotate-90' : ''}`} />
                  </div>
                </button>
                {expandedQuestion === q.id && (
                  <div className="px-4 pb-4 border-t pt-3 space-y-3">
                    {q.options && q.options.length > 0 && (
                      <div className="grid grid-cols-2 gap-2">
                        {q.options.map((opt, i) => (
                          <div
                            key={i}
                            className={`flex items-start gap-2 p-2 rounded text-sm ${
                              q.correctAnswer === String.fromCharCode(65 + i)
                                ? 'bg-emerald-50 border border-emerald-200'
                                : 'bg-gray-50'
                            }`}
                          >
                            <span className={`font-bold text-xs ${
                              q.correctAnswer === String.fromCharCode(65 + i) ? 'text-emerald-700' : 'text-gray-500'
                            }`}>
                              {String.fromCharCode(65 + i)}.
                            </span>
                            <span className="flex-1"><MathRenderer content={opt} /></span>
                          </div>
                        ))}
                      </div>
                    )}
                    {q.explanation && (
                      <div className="p-3 bg-blue-50 rounded-lg border border-blue-100">
                        <p className="text-xs font-bold text-blue-700 mb-1">Solution:</p>
                        <div className="text-sm text-blue-900">
                          <MathRenderer content={q.explanation} />
                        </div>
                      </div>
                    )}
                    {q.tags.length > 0 && (
                      <div className="flex gap-1 flex-wrap">
                        {q.tags.map(t => (
                          <span key={t} className="px-2 py-0.5 text-[10px] rounded-full bg-gray-100 text-gray-600">{t}</span>
                        ))}
                      </div>
                    )}
                    <div className="flex items-center justify-between pt-2 border-t">
                      <p className="text-[10px] text-gray-400">Added: {new Date(q.createdAt).toLocaleDateString()}</p>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteQuestion(q.id);
                        }}
                        className="flex items-center gap-1 px-2 py-1 text-[10px] font-medium text-red-600 bg-red-50 hover:bg-red-100 rounded-lg transition-colors"
                      >
                        <Trash2 className="w-3 h-3" /> Delete
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
