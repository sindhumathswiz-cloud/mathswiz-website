'use client';

import React, { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import Link from 'next/link';
import { Database, UploadCloud, CheckCircle, XCircle, AlertCircle, FileText, Search, Loader2, SplitSquareHorizontal, Edit3, Save, Clock, X, Clipboard, ChevronLeft } from 'lucide-react';
import { Montserrat } from 'next/font/google';
import MathRenderer from '@/components/MathRenderer';
import TaxonomyCascadeSelector from '@/components/admin/TaxonomyCascadeSelector';
import katex from 'katex';
import 'katex/dist/katex.min.css';

const montserrat = Montserrat({ subsets: ['latin'], weight: '800' });

function renderLatexBlock(text: string): string {
    try {
        return katex.renderToString(text, {
            throwOnError: false,
            displayMode: false,
            strict: false,
        });
    } catch {
        return text;
    }
}

function LatexInline({ content }: { content: string }) {
    let text = content
        .replace(/\\\(/g, '$')
        .replace(/\\\)/g, '$')
        .replace(/\\\[/g, '$$')
        .replace(/\\\]/g, '$$');
    const parts: { text: string; math: boolean }[] = [];
    const regex = /\$\$(.+?)\$\$|\$(.+?)\$/g;
    let lastIndex = 0;
    let match;
    while ((match = regex.exec(text)) !== null) {
        if (match.index > lastIndex) {
            parts.push({ text: text.substring(lastIndex, match.index), math: false });
        }
        parts.push({ text: match[1] || match[2] || '', math: true });
        lastIndex = match.index + match[0].length;
    }
    if (lastIndex < text.length) {
        parts.push({ text: text.substring(lastIndex), math: false });
    }
    // If no math delimiters found, try rendering entire content as inline LaTeX
    if (!parts.some(p => p.math) && /\\[a-zA-Z]|\\\(|\\\[|[\\^_{]/.test(content)) {
        return <span className="leading-relaxed katex-inline-fallback" dangerouslySetInnerHTML={{ __html: renderLatexBlock(text) }} />;
    }
    return (
        <span className="leading-relaxed">
            {parts.map((part, i) =>
                part.math ? (
                    <span key={i} dangerouslySetInnerHTML={{ __html: renderLatexBlock(part.text) }} />
                ) : (
                    <span key={i}>{part.text}</span>
                )
            )}
        </span>
    );
}

export default function AdminQuestionBank() {
    const { data: session } = useSession();
    const [questions, setQuestions] = useState<any[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [filterStatus, setFilterStatus] = useState<'PENDING_REVIEW' | 'REPORTED' | 'APPROVED' | 'ALL'>('PENDING_REVIEW');
    const [selectedQuestion, setSelectedQuestion] = useState<any | null>(null);
    const [isEditing, setIsEditing] = useState(false);
    const [selectedIds, setSelectedIds] = useState<string[]>([]);
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
    const [showOriginal, setShowOriginal] = useState(false);
    const [selectedTaxonomyIds, setSelectedTaxonomyIds] = useState<string[]>([]);

    useEffect(() => {
        if (selectedQuestion) {
            setEditForm({
                content: selectedQuestion.content || '',
                options: Array.isArray(selectedQuestion.options) ? [...selectedQuestion.options, '', '', '', ''].slice(0, 4) : ['', '', '', ''],
                correctAnswer: selectedQuestion.correctAnswer || '',
                explanation: selectedQuestion.explanation || '',
                tags: Array.isArray(selectedQuestion.tags) ? selectedQuestion.tags : [],
                type: selectedQuestion.type || 'SINGLE_CHOICE',
                difficulty: selectedQuestion.difficulty || 'MEDIUM',
                subject: selectedQuestion.subject || '',
                classLevel: selectedQuestion.classLevel || selectedQuestion.class || '',
                examType: selectedQuestion.examType || '',
            });
            setSelectedTaxonomyIds(Array.isArray(selectedQuestion.taxonomyTagIds) ? selectedQuestion.taxonomyTagIds : []);
            setIsEditing(false);
        }
    }, [selectedQuestion]);

    const handleSaveEdit = async () => {
        if (!selectedQuestion) return;
        try {
            const res = await fetch(`/api/questions/${selectedQuestion.id}`, {
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
            setIsEditing(false);
            fetchQuestions();
            // Update selected question in view
            setSelectedQuestion({ ...selectedQuestion, ...editForm });
        } catch (error) {
            console.error("Failed to save edit:", error);
            alert("Error saving changes.");
        }
    };

    const fetchQuestions = async () => {
        setIsLoading(true);
        try {
            const res = await fetch('/api/questions');
            const data = await res.json();
            if (data.questions) {
                setQuestions(data.questions);
            }
        } catch (error) {
            console.error("Failed to fetch questions:", error);
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        fetchQuestions();
    }, []);

    const handleBulkApprove = async () => {
        if (selectedIds.length === 0) return;
        try {
            await Promise.all(selectedIds.map(id => 
                fetch(`/api/questions/${id}`, {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ status: 'APPROVED' })
                })
            ));
            setQuestions(prev => prev.filter(q => !selectedIds.includes(q.id)));
            setSelectedIds([]);
            setSelectedQuestion(null);
            alert(`Successfully approved ${selectedIds.length} questions.`);
        } catch (error) {
            console.error("Bulk approve failed:", error);
            alert("Errors occurred during bulk approval.");
        }
    };

    const filteredQuestions = questions.filter(q => filterStatus === 'ALL' ? true : q.status === filterStatus);

    const handleQAAction = async (id: string, action: 'APPROVE' | 'REJECT' | 'DELETE') => {
        try {
            if (action === 'DELETE') {
                await fetch(`/api/questions/${id}`, { method: 'DELETE' });
                setQuestions(prev => prev.filter(q => q.id !== id));
            } else {
                const newStatus = action === 'APPROVE' ? 'APPROVED' : 'REPORTED';
                await fetch(`/api/questions/${id}`, {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ status: newStatus, reportedIssues: action === 'REJECT' ? 'Rejected by Admin QA' : null })
                });
                
                // Instant update for smooth UX
                if (filterStatus === 'PENDING_REVIEW' && newStatus === 'APPROVED') {
                    setQuestions(prev => prev.filter(q => q.id !== id));
                } else if (filterStatus === 'REPORTED' && newStatus === 'APPROVED') {
                    setQuestions(prev => prev.filter(q => q.id !== id));
                } else {
                    fetchQuestions();
                }
            }
            setSelectedQuestion(null);
        } catch (error) {
            console.error("Failed QA action:", error);
            alert("Error applying QA action.");
        }
    };


    const StatusBadge = ({ status }: { status: string }) => {
        switch (status) {
            case 'PENDING_REVIEW': return <span className="bg-amber-100 text-amber-700 px-3 py-1 rounded-full text-xs font-bold flex items-center gap-1 w-fit"><Clock className="w-3 h-3" /> Review Pending</span>;
            case 'APPROVED': return <span className="bg-emerald-100 text-emerald-700 px-3 py-1 rounded-full text-xs font-bold flex items-center gap-1 w-fit"><CheckCircle className="w-3 h-3" /> Approved DB</span>;
            case 'REPORTED': return <span className="bg-red-100 text-red-700 px-3 py-1 rounded-full text-xs font-bold flex items-center gap-1 w-fit"><AlertCircle className="w-3 h-3" /> Requires Edits</span>;
            default: return <span className="bg-gray-100 text-gray-700 px-3 py-1 rounded-full text-xs font-bold">{status}</span>;
        }
    };

    const Clock = ({ className }: { className?: string }) => (
        <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
    )

    return (
        <div className="min-h-screen bg-gray-50 flex flex-col py-10">
            <div className="max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8">

                {/* Header */}
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4">
                    <div className="space-y-2">
                        <Link 
                            href={session?.user && (session.user as any).role === 'TEACHER' ? "/teacher/dashboard" : "/admin/dashboard"} 
                            className="text-sm font-black text-indigo-600 hover:text-indigo-500 flex items-center gap-1 uppercase tracking-widest"
                        >
                            <ChevronLeft className="w-4 h-4" /> Back to Dashboard
                        </Link>
                        <h1 className={`text-4xl font-extrabold text-gray-900 ${montserrat.className}`}>Content QA Studio</h1>
                        <p className="text-gray-600">Centralized Quality Assurance and dataset orchestration for {session?.user && (session.user as any).role === 'TEACHER' ? 'Teachers' : 'Admins'}.</p>
                    </div>
                    <Link
                        href="/admin/question-bank/bulk-import"
                        className="bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-3 rounded-xl font-bold transition flex items-center gap-2 shadow-sm"
                    >
                        <SplitSquareHorizontal className="w-5 h-5" /> Bulk Extraction Studio
                    </Link>
                    <Link
                        href="/admin/question-bank/books"
                        className="bg-white hover:bg-gray-50 text-indigo-700 border border-indigo-200 px-5 py-3 rounded-xl font-bold transition flex items-center gap-2 shadow-sm"
                    >
                        <Database className="w-5 h-5" /> Book Library
                    </Link>
                </div>

                <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden animate-in fade-in duration-300">
                    {/* Filters */}
                        <div className="p-6 border-b border-gray-100 flex flex-wrap gap-4 items-center bg-gray-50">
                            <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2 mr-4"><Database className="w-5 h-5 text-indigo-600" /> Question Ledger</h2>

                            <div className="flex rounded-lg overflow-hidden border border-gray-300 shadow-sm">
                                <button
                                    onClick={() => setFilterStatus('PENDING_REVIEW')}
                                    className={`px-4 py-2 text-sm font-bold ${filterStatus === 'PENDING_REVIEW' ? 'bg-indigo-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}
                                >
                                    Pending Review
                                </button>
                                <button
                                    onClick={() => setFilterStatus('REPORTED')}
                                    className={`px-4 py-2 text-sm font-bold border-l border-r border-gray-300 ${filterStatus === 'REPORTED' ? 'bg-red-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}
                                >
                                    Reported
                                </button>
                                <button
                                    onClick={() => setFilterStatus('APPROVED')}
                                    className={`px-4 py-2 text-sm font-bold border-r border-gray-300 ${filterStatus === 'APPROVED' ? 'bg-emerald-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}
                                >
                                    Approved
                                </button>
                                <button
                                    onClick={() => setFilterStatus('ALL')}
                                    className={`px-4 py-2 text-sm font-bold ${filterStatus === 'ALL' ? 'bg-gray-800 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}
                                >
                                    All Questions
                                </button>
                            </div>

                            {filterStatus === 'PENDING_REVIEW' && selectedIds.length > 0 && (
                                <button 
                                    onClick={handleBulkApprove}
                                    className="ml-auto bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-lg font-black text-sm transition shadow-lg animate-in zoom-in"
                                >
                                    Bulk Approve ({selectedIds.length})
                                </button>
                            )}
                        </div>

                        {/* List */}
                        <div className="grid grid-cols-1 lg:grid-cols-3 divide-y lg:divide-y-0 lg:divide-x divide-gray-200 min-h-[600px]">
                            {/* Left Pane: Table/List */}
                            <div className="lg:col-span-1 border-r border-gray-200 overflow-y-auto max-h-[600px] bg-gray-50/50 relative">
                                {isLoading ? (
                                    <div className="p-12 text-center text-gray-500 animate-pulse">Scanning Ledger...</div>
                                ) : filteredQuestions.length === 0 ? (
                                    <div className="p-12 text-center flex flex-col items-center justify-center h-full">
                                        <CheckCircle className="w-12 h-12 text-emerald-300 mb-4" />
                                        <h3 className="text-lg font-bold text-gray-500 mb-2">QA Queue Clear!</h3>
                                        <p className="text-sm text-gray-400">No questions matching this status.</p>
                                    </div>
                                ) : (
                                    <div className="divide-y divide-gray-100">
                                        <div className="p-3 bg-indigo-50/50 border-b flex items-center gap-3">
                                            <input 
                                                type="checkbox" 
                                                checked={selectedIds.length === filteredQuestions.length && filteredQuestions.length > 0}
                                                onChange={(e) => {
                                                    if (e.target.checked) setSelectedIds(filteredQuestions.map(q => q.id));
                                                    else setSelectedIds([]);
                                                }}
                                                className="w-4 h-4 accent-indigo-600"
                                            />
                                            <span className="text-[10px] font-black text-indigo-900 uppercase tracking-widest">Select All Pending</span>
                                        </div>
                                        {filteredQuestions.map((q) => (
                                            <div
                                                key={q.id}
                                                className={`p-4 cursor-pointer transition flex gap-3 ${selectedQuestion?.id === q.id ? 'bg-indigo-50 border-l-4 border-indigo-600' : 'hover:bg-white border-l-4 border-transparent'}`}
                                            >
                                                <input 
                                                    type="checkbox"
                                                    checked={selectedIds.includes(q.id)}
                                                    onChange={(e) => {
                                                        e.stopPropagation();
                                                        if (e.target.checked) setSelectedIds(prev => [...prev, q.id]);
                                                        else setSelectedIds(prev => prev.filter(id => id !== q.id));
                                                    }}
                                                    onClick={(e) => e.stopPropagation()}
                                                    className="w-4 h-4 mt-1 accent-indigo-600"
                                                />
                                                <div className="flex-1" onClick={() => setSelectedQuestion(q)}>
                                                    <div className="flex justify-between items-start mb-2">
                                                        <StatusBadge status={q.status} />
                                                        <span className="text-xs text-gray-400 font-mono">#{q.id.substring(q.id.length - 6)}</span>
                                                    </div>
                                                    <div className="line-clamp-2 text-sm font-semibold text-gray-900">
                                                        <LatexInline content={q.content} />
                                                    </div>
                                                    <div className="mt-3 flex gap-2 text-xs font-medium text-gray-500">
                                                        <span className="bg-white border px-2 py-1 rounded">{q.class}</span>
                                                        <span className="bg-white border px-2 py-1 rounded truncate">{q.topic}</span>
                                                    </div>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>

                            {/* Right Pane: Detailed QA View */}
                            <div className="lg:col-span-2 bg-white relative">
                                {selectedQuestion ? (
                                    <div className="p-8 h-full flex flex-col">
                                        <div className="flex justify-between items-start mb-6 border-b pb-6">
                                            <div>
                                                <h3 className="text-2xl font-bold text-gray-900 mb-2 border-l-4 border-indigo-600 pl-3">Content Review</h3>
                                                <p className="text-sm text-gray-500">
                                                    Authored by: <span className="font-bold text-gray-900">{selectedQuestion.createdBy?.firstName} {selectedQuestion.createdBy?.lastName}</span>
                                                </p>
                                            </div>
                                            <div className="flex gap-2">
                                                {!isEditing ? (
                                                    <>
                                                        <button onClick={() => setIsEditing(true)} className="bg-indigo-100 hover:bg-indigo-200 text-indigo-700 px-4 py-2 rounded-lg font-bold text-sm transition flex items-center gap-2">
                                                            <Edit3 className="w-4 h-4" /> Edit Question
                                                        </button>
                                                        <button onClick={() => handleQAAction(selectedQuestion.id, 'APPROVE')} className="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-lg font-bold text-sm transition shadow flex items-center gap-2">
                                                            <CheckCircle className="w-4 h-4" /> Approve
                                                        </button>
                                                        <button onClick={() => setFilterStatus('ALL')} className="bg-amber-100 hover:bg-amber-200 text-amber-700 px-4 py-2 rounded-lg font-bold text-sm transition flex items-center gap-2">
                                                            Reject/Report
                                                        </button>
                                                    </>
                                                ) : (
                                                    <>
                                                        <button onClick={handleSaveEdit} className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg font-bold text-sm transition shadow flex items-center gap-2">
                                                            <Save className="w-4 h-4" /> Save Changes
                                                        </button>
                                                        <button onClick={() => setIsEditing(false)} className="bg-gray-100 hover:bg-gray-200 text-gray-700 px-4 py-2 rounded-lg font-bold text-sm transition flex items-center gap-2">
                                                            Cancel
                                                        </button>
                                                    </>
                                                )}
                                                <button 
                                                    onClick={() => setShowOriginal(!showOriginal)}
                                                    className={`px-4 py-2 rounded-lg font-bold text-sm transition flex items-center gap-2 ${showOriginal ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}
                                                >
                                                    <Search className="w-4 h-4" /> {showOriginal ? 'Hide Source' : 'Compare Source'}
                                                </button>
                                            </div>
                                        </div>

                                        {isEditing ? (
                                            <div className="flex-1 flex gap-6 overflow-hidden min-h-0">
                                                {/* Edit Form (Left) */}
                                                <div className="w-1/2 overflow-y-auto pr-2 space-y-6 pb-20 custom-scrollbar">
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
                                                                <div key={idx}>
                                                                    <div className="flex items-center justify-between mb-2">
                                                                        <div className="flex items-center gap-2">
                                                                            <input 
                                                                                type="radio"
                                                                                checked={isCorrect}
                                                                                onChange={() => setEditForm({...editForm, correctAnswer: letter})}
                                                                                className="w-3 h-3 accent-emerald-500 cursor-pointer"
                                                                            />
                                                                            <label className={`text-[10px] font-black uppercase tracking-widest ${isCorrect ? 'text-emerald-500' : 'text-indigo-400'}`}>Option {letter}</label>
                                                                        </div>
                                                                        {isCorrect && <span className="text-[8px] text-emerald-500 font-black uppercase tracking-tighter">âœ“ Correct</span>}
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

                                                    <div className="grid grid-cols-1 gap-4">
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
                                                                    onChange={e => {
                                                                        const val = e.target.value;
                                                                        if (val.includes(',')) {
                                                                            const parts = val.split(',');
                                                                            const newTag = parts[0].trim();
                                                                            if (newTag && !editForm.tags.includes(newTag)) {
                                                                                setEditForm({...editForm, tags: [...editForm.tags, newTag]});
                                                                                (e.target as HTMLInputElement).value = parts.slice(1).join(',');
                                                                            }
                                                                        }
                                                                    }}
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
                                                    </div>

                                                    <details className="bg-gray-50 border border-gray-200 rounded-xl group">
                                                        <summary className="cursor-pointer text-[10px] font-black text-indigo-600 uppercase tracking-widest p-3 hover:bg-gray-100 rounded-xl transition-all flex items-center gap-2 select-none">
                                                            <svg className={`w-3 h-3 transition-transform group-open:rotate-90`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                                                            Taxonomy Tags (optional)
                                                        </summary>
                                                        <div className="p-3 border-t border-gray-200">
                                                            <TaxonomyCascadeSelector 
                                                                selectedIds={selectedTaxonomyIds} 
                                                                onSelectMultiple={setSelectedTaxonomyIds}
                                                            />
                                                        </div>
                                                    </details>

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

                                                    <div>
                                                        <div className="flex items-center justify-between mb-2">
                                                            <label className="text-[10px] font-black text-blue-600 uppercase tracking-widest block">Solution / Explanation</label>
                                                            <button 
                                                                type="button"
                                                                onClick={async () => {
                                                                    try {
                                                                        const text = await navigator.clipboard.readText();
                                                                        setEditForm({...editForm, explanation: text});
                                                                    } catch {}
                                                                }}
                                                                className="flex items-center gap-1 text-gray-400 hover:text-indigo-600 text-[9px] font-black uppercase tracking-widest transition-all"
                                                            >
                                                                <Clipboard className="w-3 h-3" /> Quick Paste
                                                            </button>
                                                        </div>
                                                        <textarea 
                                                            value={editForm.explanation}
                                                            onChange={e => setEditForm({...editForm, explanation: e.target.value})}
                                                            className="w-full bg-gray-50 border border-gray-200 rounded-xl p-4 text-xs font-mono focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
                                                            rows={4}
                                                        />
                                                    </div>
                                                </div>

                                                {/* Live Preview (Right) */}
                                                <div className="w-1/2 bg-gray-50 rounded-2xl p-6 border border-gray-200 shadow-inner overflow-y-auto relative">
                                                    <div className="absolute top-4 right-4 bg-indigo-600 text-white text-[9px] uppercase font-black px-2 py-1 rounded tracking-widest">
                                                        Live Preview
                                                    </div>
                                                    <div className="prose max-w-none text-gray-900 text-lg leading-relaxed mb-6">
                                                        <MathRenderer content={editForm.content || '*(Start typing to see preview)*'} />
                                                    </div>
                                                    <div className="grid grid-cols-1 gap-3">
                                                        {editForm.options.map((opt: string, idx: number) => (
                                                            <div key={idx} className={`p-3 rounded-lg border flex items-center gap-3 ${editForm.correctAnswer.toUpperCase().includes(String.fromCharCode(65 + idx)) ? 'bg-emerald-50 border-emerald-200' : 'bg-white border-gray-200'}`}>
                                                                <span className="font-bold text-indigo-600">{String.fromCharCode(65 + idx)}.</span>
                                                                <MathRenderer content={opt || 'â€”'} />
                                                            </div>
                                                        ))}
                                                    </div>
                                                    {editForm.explanation && (
                                                        <div className="mt-6 p-4 bg-blue-50 border border-blue-100 rounded-xl">
                                                            <h4 className="text-[10px] font-black text-blue-600 uppercase mb-2">Solution Preview</h4>
                                                            <MathRenderer content={editForm.explanation} />
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        ) : (
                                            <div className={`flex-1 flex gap-6 overflow-hidden min-h-0 ${showOriginal ? 'flex-row' : 'flex-col'}`}>
                                                {showOriginal && (
                                                    <div className="w-1/2 bg-slate-900 rounded-xl p-6 border border-slate-700 overflow-y-auto shadow-inner group">
                                                        <div className="flex items-center justify-between mb-4 border-b border-slate-800 pb-3">
                                                            <h4 className="text-[10px] font-black text-indigo-400 uppercase tracking-widest">Raw Source Extraction</h4>
                                                            <span className="text-[8px] text-slate-500 font-mono">SOURCE: {selectedQuestion.sourceUrl?.substring(0, 30) || 'Unknown'}...</span>
                                                        </div>
                                                        <div className="text-xs font-mono text-slate-300 leading-relaxed whitespace-pre-wrap">
                                                            {selectedQuestion.originalRawText || 'No raw source text available for this question.'}
                                                        </div>
                                                    </div>
                                                )}
                                                
                                                <div className={`${showOriginal ? 'w-1/2' : 'w-full'} bg-gray-50 rounded-xl p-8 border border-gray-200 shadow-inner overflow-y-auto relative select-none`} onContextMenu={(e) => e.preventDefault()}>
                                                    <div className="absolute top-4 right-4 bg-gray-800 text-gray-400 text-[10px] uppercase font-bold px-2 py-1 rounded tracking-widest">
                                                        Protected Canvas
                                                    </div>

                                                    <div className="flex flex-wrap gap-2 mb-6">
                                                        {selectedQuestion.type && <span className="bg-indigo-100 text-indigo-700 text-[10px] font-bold px-2 py-1 rounded uppercase tracking-wider">{selectedQuestion.type.replace(/_/g, ' ')}</span>}
                                                        {selectedQuestion.difficulty && <span className={`text-[10px] font-bold px-2 py-1 rounded uppercase tracking-wider ${selectedQuestion.difficulty === 'EASY' ? 'bg-emerald-100 text-emerald-700' : selectedQuestion.difficulty === 'HARD' ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'}`}>{selectedQuestion.difficulty}</span>}
                                                        {selectedQuestion.subject && <span className="bg-blue-100 text-blue-700 text-[10px] font-bold px-2 py-1 rounded uppercase tracking-wider">{selectedQuestion.subject}</span>}
                                                        {selectedQuestion.class && <span className="bg-purple-100 text-purple-700 text-[10px] font-bold px-2 py-1 rounded uppercase tracking-wider">{selectedQuestion.class}</span>}
                                                        {selectedQuestion.examType && <span className="bg-rose-100 text-rose-700 text-[10px] font-bold px-2 py-1 rounded uppercase tracking-wider">{selectedQuestion.examType}</span>}
                                                    </div>

                                                    <div className="prose max-w-none text-gray-900 text-lg leading-relaxed mb-8">
                                                        <MathRenderer content={selectedQuestion.content} />
                                                    </div>

                                                    {selectedQuestion.options && Array.isArray(selectedQuestion.options) && (
                                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-8 bg-white p-6 rounded-xl border border-gray-200">
                                                            <h4 className="text-sm font-bold text-gray-900 col-span-full mb-2 uppercase tracking-wide">Options Provided</h4>
                                                            {selectedQuestion.options.map((opt: string, idx: number) => {
                                                                const letter = String.fromCharCode(65 + idx);
                                                                const isCorrect = selectedQuestion.correctAnswer === letter || selectedQuestion.correctAnswer === opt;
                                                                return opt && (
                                                                    <div key={idx} className={`p-4 rounded-xl border-2 flex items-center gap-4 transition-all duration-300 ${isCorrect ? 'border-emerald-500 bg-emerald-50 shadow-md transform scale-[1.02]' : 'border-gray-100 bg-gray-50'}`}>
                                                                        <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm shrink-0 ${isCorrect ? 'bg-emerald-600 text-white' : 'bg-white border-2 border-gray-300 text-gray-500'}`}>
                                                                            {letter}
                                                                        </div>
                                                                        <div className={`flex-1 overflow-x-auto text-sm ${isCorrect ? 'font-bold text-emerald-900' : ''}`}>
                                                                            <MathRenderer content={opt} />
                                                                        </div>
                                                                        {isCorrect && <CheckCircle className="w-5 h-5 text-emerald-500" />}
                                                                    </div>
                                                                );
                                                            })}
                                                        </div>
                                                    )}

                                                    {selectedQuestion.correctAnswer && (!selectedQuestion.options || !Array.isArray(selectedQuestion.options)) && (
                                                        <div className="mt-8 bg-emerald-50 p-6 rounded-xl border border-emerald-200">
                                                            <h4 className="text-sm font-bold text-emerald-900 mb-2 uppercase tracking-wide">Correct Value</h4>
                                                            <div className="text-xl font-bold text-emerald-700">{selectedQuestion.correctAnswer}</div>
                                                        </div>
                                                    )}

                                                    {selectedQuestion.explanation && (
                                                        <div className="mt-8 bg-blue-50 p-6 rounded-xl border border-blue-200">
                                                            <h4 className="text-sm font-bold text-blue-900 mb-4 uppercase tracking-wide flex items-center gap-2">
                                                                <FileText className="w-4 h-4" /> Attached Solution
                                                            </h4>
                                                            <div className="text-sm text-blue-900">
                                                                <MathRenderer content={selectedQuestion.explanation} />
                                                            </div>
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        )}

                                        <div className="mt-6 border-t pt-4 flex justify-end">
                                            <button onClick={() => handleQAAction(selectedQuestion.id, 'DELETE')} className="text-red-500 hover:text-red-700 text-sm font-bold flex items-center gap-1 transition">
                                                Delete Question Permanently
                                            </button>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="h-full flex flex-col items-center justify-center text-gray-400 p-12 text-center">
                                        <Search className="w-16 h-16 mb-4 text-gray-200" />
                                        <h3 className="text-xl font-bold text-gray-500 mb-2">Select a Question</h3>
                                        <p>Click on any question from the ledger to perform detailed LaTeX review and QA actions.</p>
                                    </div>
                                )}
                            </div>
                        </div>
                </div>
            </div>
        </div>
    );
}


