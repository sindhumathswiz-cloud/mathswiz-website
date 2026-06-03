'use client';

import React, { useState, useEffect } from 'react';
import { BookOpen, CheckCircle, AlertCircle, TrendingUp, Layers, Target, Award, GraduationCap, FileText, RefreshCw, ChevronRight, ArrowLeft, Search, X, Trash2, Edit3, Save, Tag, CheckSquare } from 'lucide-react';
import MathRenderer from '@/components/MathRenderer';
import TaxonomyCascadeSelector from '@/components/admin/TaxonomyCascadeSelector';
import katex from 'katex';
import 'katex/dist/katex.min.css';
import toast from 'react-hot-toast';

function renderLatexBlock(text: string): string {
  try {
    return katex.renderToString(text, { throwOnError: false, displayMode: false, strict: false });
  } catch {
    return text;
  }
}

function LatexInline({ content }: { content: string }) {
  let text = content
    .replace(/\\\(/g, '$').replace(/\\\)/g, '$')
    .replace(/\\\[/g, '$$').replace(/\\\]/g, '$$');
  const parts: { text: string; math: boolean }[] = [];
  const regex = /\$\$(.+?)\$$|\$(.+?)\$/g;
  let lastIndex = 0, match;
  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) parts.push({ text: text.substring(lastIndex, match.index), math: false });
    parts.push({ text: match[1] || match[2] || '', math: true });
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < text.length) parts.push({ text: text.substring(lastIndex), math: false });
  if (!parts.some(p => p.math) && /\\[a-zA-Z]|\\\(|\\\[|[\\^_{]/.test(content)) {
    return <span className="leading-relaxed" dangerouslySetInnerHTML={{ __html: renderLatexBlock(text) }} />;
  }
  return (<span className="leading-relaxed">{parts.map((part, i) => part.math ? <span key={i} dangerouslySetInnerHTML={{ __html: renderLatexBlock(part.text) }} /> : <span key={i}>{part.text}</span>)}</span>);
}

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
  const [editingQuestionId, setEditingQuestionId] = useState<string | null>(null);
  const [selectedTaxonomyIds, setSelectedTaxonomyIds] = useState<string[]>([]);
  const [selectedQuestionIds, setSelectedQuestionIds] = useState<string[]>([]);
  const [bulkTagInput, setBulkTagInput] = useState('');
  const [bulkExamType, setBulkExamType] = useState('');
  const [bulkType, setBulkType] = useState('');
  const [bulkDifficulty, setBulkDifficulty] = useState('');
  const [bulkSubject, setBulkSubject] = useState('');
  const [bulkClass, setBulkClass] = useState('');
  const [bulkPanelExpanded, setBulkPanelExpanded] = useState(false);
  const [editForm, setEditForm] = useState<any>({
    content: '',
    options: ['', '', '', ''],
    correctAnswer: '',
    explanation: '',
    tags: [],
    type: 'SINGLE_CHOICE',
    difficulty: 'MEDIUM',
    subject: '',
    classLevel: '',
    examType: '',
  });

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

  const startEditing = (q: Question) => {
    setEditingQuestionId(q.id);
    setEditForm({
      content: q.content || '',
      options: Array.isArray(q.options) ? [...q.options, '', '', '', ''].slice(0, 4) : ['', '', '', ''],
      correctAnswer: q.correctAnswer || '',
      explanation: q.explanation || '',
      tags: Array.isArray(q.tags) ? q.tags : [],
      type: q.type || 'SINGLE_CHOICE',
      difficulty: q.difficulty || 'MEDIUM',
      subject: q.subject || '',
      classLevel: q.class || '',
      examType: q.examType || '',
    });
    setSelectedTaxonomyIds((q as any).taxonomyTagIds || []);
  };

  const handleSaveEdit = async () => {
    if (!editingQuestionId) return;
    try {
      const res = await fetch(`/api/questions/${editingQuestionId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content: editForm.content,
          options: editForm.options.some((o: string) => o.trim()) ? editForm.options : undefined,
          correctAnswer: editForm.correctAnswer,
          explanation: editForm.explanation,
          tags: editForm.tags,
          type: editForm.type,
          difficulty: editForm.difficulty,
          subject: editForm.subject,
          'class': editForm.classLevel,
          examType: editForm.examType,
          taxonomyTagIds: selectedTaxonomyIds,
        })
      });
      if (!res.ok) throw new Error('Failed to save');
      toast.success('Question updated successfully!');
      setEditingQuestionId(null);
      fetchQuestions({ [drillFilter]: drillCategory, status: 'APPROVED' });
      fetchStats();
    } catch (e) {
      console.error(e);
      toast.error('Failed to save changes');
    }
  };

  const toggleSelectQuestion = (id: string) => {
    setSelectedQuestionIds(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  };

  const toggleSelectAllQuestions = () => {
    if (selectedQuestionIds.length === filteredQuestions.length) {
      setSelectedQuestionIds([]);
    } else {
      setSelectedQuestionIds(filteredQuestions.map(q => q.id));
    }
  };

  const clearSelectedQuestions = () => setSelectedQuestionIds([]);

  const applyBulkTags = async () => {
    if (selectedQuestionIds.length === 0) return;
    const tags = bulkTagInput.split(',').map(t => t.trim()).filter(Boolean);
    const body: any = { questionIds: selectedQuestionIds };
    if (tags.length > 0) { body.tags = tags; body.action = 'ADD'; }
    if (bulkExamType) body.examType = bulkExamType;
    if (bulkType) body.type = bulkType;
    if (bulkDifficulty) body.difficulty = bulkDifficulty;
    if (bulkSubject) body.subject = bulkSubject;
    if (bulkClass) body.class = bulkClass;
    if (Object.keys(body).length <= 1) { toast.error('No fields to update'); return; }
    try {
      const res = await fetch('/api/questions/bulk', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || `Server error ${res.status}`);
      }
      toast.success(`Updated ${selectedQuestionIds.length} questions`);
      setBulkTagInput('');
      setBulkExamType('');
      setBulkType('');
      setBulkDifficulty('');
      setBulkSubject('');
      setBulkClass('');
      setSelectedQuestionIds([]);
      setBulkPanelExpanded(false);
      fetchQuestions({ [drillFilter]: drillCategory, status: 'APPROVED' });
      fetchStats();
    } catch (e: any) {
      console.error(e);
      toast.error(e?.message || 'Failed to bulk update');
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
    INTEGER: 'bg-purple-100 text-purple-700',
    TRUE_FALSE: 'bg-teal-100 text-teal-700',
    SUBJECTIVE: 'bg-gray-100 text-gray-700',
    FILL_IN_BLANKS: 'bg-pink-100 text-pink-700',
    ASSERTION_REASONING: 'bg-orange-100 text-orange-700',
    CASE_STUDY: 'bg-rose-100 text-rose-700',
    VERY_SHORT_ANSWER: 'bg-cyan-100 text-cyan-700',
    SHORT_ANSWER: 'bg-sky-100 text-sky-700',
    LONG_ANSWER: 'bg-violet-100 text-violet-700',
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
        <div className="flex items-center gap-3">
          <div className="relative flex-1">
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
          <label className="flex items-center gap-1.5 text-xs text-gray-500 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={selectedQuestionIds.length === filteredQuestions.length && filteredQuestions.length > 0}
              onChange={toggleSelectAllQuestions}
              className="w-3.5 h-3.5 accent-indigo-600"
            />
            Select All
          </label>
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
                {editingQuestionId === q.id ? (
                  <div className="p-6 space-y-6">
                    <div className="flex justify-between items-center border-b pb-4">
                      <h4 className="font-bold text-gray-900 text-lg">Edit Approved Question</h4>
                      <div className="flex gap-2">
                        <button onClick={handleSaveEdit} className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg font-bold text-sm transition flex items-center gap-2 shadow shadow-indigo-100">
                          <Save className="w-4 h-4" /> Save Changes
                        </button>
                        <button onClick={() => setEditingQuestionId(null)} className="bg-gray-100 hover:bg-gray-200 text-gray-700 px-4 py-2 rounded-lg font-bold text-sm transition">
                          Cancel
                        </button>
                      </div>
                    </div>

                    <div className="space-y-4">
                      <div>
                        <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-2">Problem Statement (LaTeX)</label>
                        <textarea 
                          value={editForm.content}
                          onChange={e => setEditForm({...editForm, content: e.target.value})}
                          className="w-full bg-gray-50 border border-gray-200 rounded-xl p-4 text-sm font-mono focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
                          rows={6}
                        />
                      </div>

                      <div className="grid grid-cols-2 gap-4">
                        {editForm.options.map((opt: string, idx: number) => {
                          const letter = String.fromCharCode(65 + idx);
                          const isCorrect = editForm.correctAnswer.toUpperCase().includes(letter);
                          return (
                            <div key={idx} className="space-y-1">
                              <div className="flex items-center gap-2">
                                <input 
                                  type="radio"
                                  checked={isCorrect}
                                  onChange={() => setEditForm({...editForm, correctAnswer: letter})}
                                  className="w-3 h-3 accent-emerald-500 cursor-pointer"
                                />
                                <label className={`text-[10px] font-black uppercase tracking-widest ${isCorrect ? 'text-emerald-500' : 'text-indigo-400'}`}>Option {letter}</label>
                              </div>
                              <textarea 
                                value={opt}
                                onChange={e => {
                                  const newOpts = [...editForm.options];
                                  newOpts[idx] = e.target.value;
                                  setEditForm({...editForm, options: newOpts});
                                }}
                                className="w-full bg-gray-50 border border-gray-200 rounded-xl p-3 text-xs font-mono focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
                                rows={2}
                              />
                            </div>
                          );
                        })}
                      </div>

                      <div>
                        <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-2">Academic Tags</label>
                        <div className="flex flex-wrap gap-2 p-3 bg-gray-50 border border-gray-200 rounded-xl min-h-[46px]">
                          {editForm.tags.map((tag: string, tidx: number) => (
                            <span key={tidx} className="bg-indigo-600 text-white px-2 py-1 rounded-lg text-xs font-bold flex items-center gap-1 group">
                              {tag}
                              <X 
                                className="w-3 h-3 cursor-pointer hover:text-red-300 transition-colors" 
                                onClick={() => {
                                  const newTags = [...editForm.tags];
                                  newTags.splice(tidx, 1);
                                  setEditForm({...editForm, tags: newTags});
                                }}
                              />
                            </span>
                          ))}
                          <input 
                            className="bg-transparent border-none outline-none text-sm text-gray-600 flex-1 min-w-[100px]"
                            placeholder="+ add tag..."
                            onKeyDown={e => {
                              const val = (e.target as HTMLInputElement).value.trim();
                              if (e.key === 'Enter' && val) {
                                e.preventDefault();
                                if (!editForm.tags.includes(val)) {
                                  setEditForm({...editForm, tags: [...editForm.tags, val]});
                                }
                                (e.target as HTMLInputElement).value = '';
                              }
                            }}
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-2">Type</label>
                          <select value={editForm.type} onChange={e => setEditForm({...editForm, type: e.target.value})} className="w-full bg-gray-50 border border-gray-200 rounded-xl p-3 text-sm font-mono focus:ring-2 focus:ring-indigo-500 outline-none transition-all">
                            <option value="SINGLE_CHOICE">Single Choice</option>
                            <option value="MULTIPLE_CHOICE">Multiple Choice</option>
                            <option value="INTEGER">Integer</option>
                            <option value="TRUE_FALSE">True/False</option>
                            <option value="SUBJECTIVE">Subjective</option>
                            <option value="FILL_IN_BLANKS">Fill in Blanks</option>
                            <option value="ASSERTION_REASONING">Assertion-Reasoning</option>
                            <option value="CASE_STUDY">Case Study</option>
                            <option value="VERY_SHORT_ANSWER">Very Short Answer</option>
                            <option value="SHORT_ANSWER">Short Answer</option>
                            <option value="LONG_ANSWER">Long Answer</option>
                          </select>
                        </div>
                        <div>
                          <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-2">Difficulty</label>
                          <select value={editForm.difficulty} onChange={e => setEditForm({...editForm, difficulty: e.target.value})} className="w-full bg-gray-50 border border-gray-200 rounded-xl p-3 text-sm font-mono focus:ring-2 focus:ring-indigo-500 outline-none transition-all">
                            <option value="EASY">Easy</option>
                            <option value="MEDIUM">Medium</option>
                            <option value="HARD">Hard</option>
                          </select>
                        </div>
                        <div>
                          <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-2">Subject</label>
                          <input type="text" value={editForm.subject} onChange={e => setEditForm({...editForm, subject: e.target.value})} placeholder="e.g. Mathematics" className="w-full bg-gray-50 border border-gray-200 rounded-xl p-3 text-sm font-mono focus:ring-2 focus:ring-indigo-500 outline-none transition-all"/>
                        </div>
                        <div>
                          <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-2">Class</label>
                          <input type="text" value={editForm.classLevel} onChange={e => setEditForm({...editForm, classLevel: e.target.value})} placeholder="e.g. Class 12" className="w-full bg-gray-50 border border-gray-200 rounded-xl p-3 text-sm font-mono focus:ring-2 focus:ring-indigo-500 outline-none transition-all"/>
                        </div>
                        <div>
                          <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-2">Exam Type</label>
                          <input type="text" value={editForm.examType} onChange={e => setEditForm({...editForm, examType: e.target.value})} placeholder="e.g. JEE Main" className="w-full bg-gray-50 border border-gray-200 rounded-xl p-3 text-sm font-mono focus:ring-2 focus:ring-indigo-500 outline-none transition-all"/>
                        </div>
                      </div>

                      <details className="bg-gray-50 border border-gray-200 rounded-xl group mt-4">
                        <summary className="cursor-pointer text-[10px] font-black text-indigo-600 uppercase tracking-widest p-3 hover:bg-gray-100 rounded-xl transition-all flex items-center gap-2 select-none">
                          <svg className={`w-3 h-3 transition-transform group-open:rotate-90`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                          Taxonomy Tags (optional)
                        </summary>
                        <div className="p-3 border-t border-gray-200">
                          <TaxonomyCascadeSelector selectedIds={selectedTaxonomyIds} onSelectMultiple={setSelectedTaxonomyIds} />
                        </div>
                      </details>

                      <div>
                        <label className="text-[10px] font-black text-blue-600 uppercase tracking-widest block mb-2">Solution / Explanation</label>
                        <textarea 
                          value={editForm.explanation}
                          onChange={e => setEditForm({...editForm, explanation: e.target.value})}
                          className="w-full bg-gray-50 border border-gray-200 rounded-xl p-4 text-xs font-mono focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
                          rows={4}
                        />
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="flex">
                    <label className="flex items-start p-4 pr-0 cursor-pointer" onClick={e => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked={selectedQuestionIds.includes(q.id)}
                        onChange={() => toggleSelectQuestion(q.id)}
                        className="w-4 h-4 mt-1 accent-indigo-600"
                      />
                    </label>
                    <div className="flex-1 min-w-0">
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
                          <p className="text-sm text-gray-800 line-clamp-2"><LatexInline content={q.content} /></p>
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
                          <div className="flex gap-2">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                startEditing(q);
                              }}
                              className="flex items-center gap-1 px-3 py-1 text-[10px] font-medium text-indigo-600 bg-indigo-50 hover:bg-indigo-100 rounded-lg transition-colors"
                            >
                              <Edit3 className="w-3 h-3" /> Edit
                            </button>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDeleteQuestion(q.id);
                              }}
                              className="flex items-center gap-1 px-3 py-1 text-[10px] font-medium text-red-600 bg-red-50 hover:bg-red-100 rounded-lg transition-colors"
                            >
                              <Trash2 className="w-3 h-3" /> Delete
                            </button>
                          </div>
                        </div>
                      </div>
                    )}
                    </div>
                    </div>
                  )}
              </div>
            ))
          )}
        </div>
      )}

      {/* Bulk tag action bar */}
      {selectedQuestionIds.length > 0 && (
        <div className="fixed bottom-0 left-0 right-0 bg-white border-t shadow-2xl z-50">
          <div className="p-4 flex items-center gap-4">
            <CheckSquare className="w-5 h-5 text-indigo-600 shrink-0" />
            <span className="text-sm font-bold text-gray-700 whitespace-nowrap">{selectedQuestionIds.length} selected</span>
            <div className="flex-1 flex items-center gap-2">
              <Tag className="w-4 h-4 text-gray-400 shrink-0" />
              <input
                type="text"
                value={bulkTagInput}
                onChange={e => setBulkTagInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') applyBulkTags() }}
                placeholder="Add tags (comma separated)..."
                className="flex-1 px-3 py-2 text-sm border rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
              />
            </div>
            <button onClick={applyBulkTags} className="px-4 py-2 bg-indigo-600 text-white text-sm font-bold rounded-lg hover:bg-indigo-700 transition shrink-0">
              Apply All
            </button>
            <button
              onClick={() => setBulkPanelExpanded(!bulkPanelExpanded)}
              className="px-3 py-2 text-sm text-gray-500 font-bold hover:bg-gray-100 rounded-lg transition shrink-0"
            >
              {bulkPanelExpanded ? 'Hide Fields' : 'More Fields'}
            </button>
            <button onClick={clearSelectedQuestions} className="px-3 py-2 text-sm text-gray-500 font-bold hover:bg-gray-100 rounded-lg transition shrink-0">
              Clear
            </button>
          </div>
          {bulkPanelExpanded && (
            <div className="px-4 pb-4 border-t pt-3 grid grid-cols-2 md:grid-cols-5 gap-3">
              <div>
                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-1">Type</label>
                <select value={bulkType} onChange={e => setBulkType(e.target.value)} className="w-full bg-gray-50 border border-gray-200 rounded-lg p-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none">
                  <option value="">— No change —</option>
                  <option value="SINGLE_CHOICE">Single Choice</option>
                  <option value="MULTIPLE_CHOICE">Multiple Choice</option>
                  <option value="INTEGER">Integer</option>
                  <option value="TRUE_FALSE">True/False</option>
                  <option value="SUBJECTIVE">Subjective</option>
                  <option value="FILL_IN_BLANKS">Fill in Blanks</option>
                  <option value="ASSERTION_REASONING">Assertion-Reasoning</option>
                  <option value="CASE_STUDY">Case Study</option>
                  <option value="VERY_SHORT_ANSWER">Very Short Answer</option>
                  <option value="SHORT_ANSWER">Short Answer</option>
                  <option value="LONG_ANSWER">Long Answer</option>
                </select>
              </div>
              <div>
                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-1">Difficulty</label>
                <select value={bulkDifficulty} onChange={e => setBulkDifficulty(e.target.value)} className="w-full bg-gray-50 border border-gray-200 rounded-lg p-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none">
                  <option value="">— No change —</option>
                  <option value="EASY">Easy</option>
                  <option value="MEDIUM">Medium</option>
                  <option value="HARD">Hard</option>
                </select>
              </div>
              <div>
                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-1">Exam Type</label>
                <input type="text" value={bulkExamType} onChange={e => setBulkExamType(e.target.value)} placeholder="e.g. JEE Main" className="w-full bg-gray-50 border border-gray-200 rounded-lg p-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none" />
              </div>
              <div>
                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-1">Subject</label>
                <input type="text" value={bulkSubject} onChange={e => setBulkSubject(e.target.value)} placeholder="e.g. Mathematics" className="w-full bg-gray-50 border border-gray-200 rounded-lg p-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none" />
              </div>
              <div>
                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-1">Class</label>
                <input type="text" value={bulkClass} onChange={e => setBulkClass(e.target.value)} placeholder="e.g. Class 12" className="w-full bg-gray-50 border border-gray-200 rounded-lg p-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none" />
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
