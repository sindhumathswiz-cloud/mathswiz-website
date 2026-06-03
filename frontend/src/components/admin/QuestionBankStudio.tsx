'use client';

import React, { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import Link from 'next/link';
import { Database, SplitSquareHorizontal, CheckCircle, XCircle, AlertCircle, FileText, Search, Edit3, Save, Clock, X, Clipboard, ChevronLeft, FileSpreadsheet, Shield, Users } from 'lucide-react';
import { Montserrat } from 'next/font/google';
import MathRenderer from '@/components/MathRenderer';
import { BulkImportModal } from './BulkImportModal';

const montserrat = Montserrat({ subsets: ['latin'], weight: '800' });

const StatusBadge = ({ status }: { status: string }) => {
    switch (status) {
        case 'DRAFT': return <span className="bg-indigo-100 text-indigo-700 px-3 py-1 rounded-full text-xs font-bold flex items-center gap-1 w-fit"><SplitSquareHorizontal className="w-3 h-3" /> Draft (Untested)</span>;
        case 'PENDING_REVIEW': return <span className="bg-amber-100 text-amber-700 px-3 py-1 rounded-full text-xs font-bold flex items-center gap-1 w-fit"><Clock className="w-3 h-3" /> Review Pending</span>;
        case 'APPROVED': return <span className="bg-emerald-100 text-emerald-700 px-3 py-1 rounded-full text-xs font-bold flex items-center gap-1 w-fit"><CheckCircle className="w-3 h-3" /> Approved DB</span>;
        case 'REPORTED': return <span className="bg-red-100 text-red-700 px-3 py-1 rounded-full text-xs font-bold flex items-center gap-1 w-fit"><AlertCircle className="w-3 h-3" /> Requires Edits</span>;
        default: return <span className="bg-gray-100 text-gray-700 px-3 py-1 rounded-full text-xs font-bold">{status}</span>;
    }
};

const ScopeBadge = ({ scope }: { scope: string }) => {
    switch (scope) {
        case 'PUBLIC': return <span className="bg-blue-100 text-blue-700 px-3 py-1 rounded-full text-xs font-bold flex items-center gap-1 w-fit"><Shield className="w-3 h-3" /> Public</span>;
        case 'TEACHER_PRIVATE': return <span className="bg-purple-100 text-purple-700 px-3 py-1 rounded-full text-xs font-bold flex items-center gap-1 w-fit"><Users className="w-3 h-3" /> Teacher</span>;
        default: return null;
    }
};

export function QuestionBankStudio({ publicCount, teacherPrivateCount }: { publicCount?: number; teacherPrivateCount?: number }) {
    const { data: session } = useSession();
    const [questions, setQuestions] = useState<any[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [filterStatus, setFilterStatus] = useState<'DRAFT' | 'PENDING_REVIEW' | 'REPORTED' | 'ALL'>('ALL');
    const [filterScope, setFilterScope] = useState<'PUBLIC' | 'TEACHER_PRIVATE' | 'ALL'>('ALL');
    const [selectedQuestion, setSelectedQuestion] = useState<any | null>(null);
    const [isEditing, setIsEditing] = useState(false);
    const [isSplitView, setIsSplitView] = useState(false);
    const [selectedIds, setSelectedIds] = useState<string[]>([]);
    const [isImportModalOpen, setIsImportModalOpen] = useState(false);
    const [editForm, setEditForm] = useState<any>({
        content: '',
        options: ['', '', '', ''],
        correctAnswer: '',
        explanation: '',
        tags: []
    });

    useEffect(() => {
        if (selectedQuestion) {
            setEditForm({
                content: selectedQuestion.content || '',
                options: Array.isArray(selectedQuestion.options) ? [...selectedQuestion.options, '', '', '', ''].slice(0, 4) : ['', '', '', ''],
                correctAnswer: selectedQuestion.correctAnswer || '',
                explanation: selectedQuestion.explanation || '',
                tags: Array.isArray(selectedQuestion.tags) ? selectedQuestion.tags : []
            });
            setIsEditing(false);
        }
    }, [selectedQuestion]);

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
                    tags: editForm.tags
                })
            });
            if (!res.ok) throw new Error('Failed to save');
            setIsEditing(false);
            fetchQuestions();
            setSelectedQuestion({ ...selectedQuestion, ...editForm });
        } catch (error) {
            console.error("Failed to save edit:", error);
            alert("Error saving changes.");
        }
    };

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

    const filteredQuestions = questions.filter(q => {
        if (filterStatus !== 'ALL' && q.status !== filterStatus) return false;
        if (filterScope !== 'ALL' && q.scope !== filterScope) return false;
        return true;
    });

    return (
        <div className="space-y-8 animate-in fade-in duration-300">
            <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
                <BulkImportModal 
                isOpen={isImportModalOpen} 
                onClose={() => setIsImportModalOpen(false)} 
                onImportComplete={fetchQuestions} 
            />
            {/* Filters */}
            <div className="p-6 border-b border-gray-100 flex flex-wrap gap-4 items-center bg-gray-50">
                <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2 mr-4">
                    <Database className="w-5 h-5 text-indigo-600" /> Question Ledger
                </h2>

                {/* Status Filter */}
                <div className="flex rounded-lg overflow-hidden border border-gray-300 shadow-sm">
                    {(['DRAFT', 'PENDING_REVIEW', 'REPORTED', 'ALL'] as const).map((status) => (
                        <button
                            key={status}
                            onClick={() => setFilterStatus(status)}
                            className={`px-4 py-2 text-sm font-bold ${filterStatus === status ? 'bg-indigo-900 text-white' : 'bg-white text-gray-600 hover:bg-gray-100'}`}
                        >
                            {status === 'ALL' ? 'All' : status === 'PENDING_REVIEW' ? 'Pending' : status === 'REPORTED' ? 'Reported' : 'Drafts'}
                        </button>
                    ))}
                </div>

                {/* Scope Filter */}
                <div className="flex rounded-lg overflow-hidden border border-gray-300 shadow-sm">
                    {(['PUBLIC', 'TEACHER_PRIVATE', 'ALL'] as const).map((scope) => (
                        <button
                            key={scope}
                            onClick={() => setFilterScope(scope)}
                            className={`px-4 py-2 text-sm font-bold ${filterScope === scope ? 'bg-indigo-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-100'}`}
                        >
                            {scope === 'ALL' ? 'All Scopes' : scope === 'PUBLIC' ? 'Public' : 'Teacher'}
                        </button>
                    ))}
                </div>

                {filterStatus === 'PENDING_REVIEW' && selectedIds.length > 0 && (
                    <button 
                        onClick={handleBulkApprove}
                        className="ml-auto bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-lg font-black text-sm transition shadow-lg animate-in zoom-in"
                    >
                        Bulk Approve ({selectedIds.length})
                    </button>
                )}
                
                <button
                    onClick={() => setIsImportModalOpen(true)}
                    className="ml-auto bg-emerald-100 text-emerald-700 hover:bg-emerald-200 px-4 py-2 rounded-lg font-bold text-sm transition flex items-center gap-2 border border-emerald-200 shadow-sm"
                >
                    <FileSpreadsheet className="w-4 h-4" /> Bulk Excel Import
                </button>
                <Link
                    href="/admin/question-bank/bulk-import"
                    className="ml-3 bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg font-bold text-sm transition flex items-center gap-2"
                >
                    <SplitSquareHorizontal className="w-4 h-4" /> Bulk Extraction
                </Link>
            </div>

            {/* Content Studio Logic Container */}
            <div className="grid grid-cols-1 lg:grid-cols-3 divide-y lg:divide-y-0 lg:divide-x divide-gray-200 min-h-[600px]">
                {/* Left Pane: Table/List */}
                <div className="lg:col-span-1 border-r border-gray-200 overflow-y-auto max-h-[600px] bg-gray-50/50">
                    {isLoading ? (
                        <div className="p-12 text-center text-gray-500">Scanning Ledger...</div>
                    ) : filteredQuestions.length === 0 ? (
                        <div className="p-12 text-center h-full flex flex-col items-center justify-center">
                            <CheckCircle className="w-12 h-12 text-emerald-300 mb-4" />
                            <h3 className="text-lg font-bold text-gray-500 mb-2">QA Queue Clear!</h3>
                        </div>
                    ) : (
                        <div className="divide-y divide-gray-100">
                            {filteredQuestions.map((q) => (
                                <div
                                    key={q.id}
                                    className={`p-4 cursor-pointer transition flex gap-3 ${selectedQuestion?.id === q.id ? 'bg-indigo-50 border-l-4 border-indigo-600' : 'hover:bg-white'}`}
                                    onClick={() => setSelectedQuestion(q)}
                                >
                                    <input 
                                        type="checkbox"
                                        checked={selectedIds.includes(q.id)}
                                        onChange={(e) => {
                                            e.stopPropagation();
                                            if (e.target.checked) setSelectedIds(prev => [...prev, q.id]);
                                            else setSelectedIds(prev => prev.filter(id => id !== q.id));
                                        }}
                                        className="w-4 h-4 mt-1"
                                    />
                                    <div className="flex-1">
                                        <div className="flex gap-2 items-start mb-2">
                                            <StatusBadge status={q.status} />
                                            {q.scope && <ScopeBadge scope={q.scope} />}
                                        </div>
                                        <div className="text-sm font-semibold text-gray-900 line-clamp-2 leading-relaxed">
                                            <MathRenderer content={q.content} />
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {/* Right Pane: Detailed QA View */}
                <div className="lg:col-span-2 bg-white p-8">
                    {selectedQuestion ? (
                        <div className="h-full flex flex-col">
                            <div className="flex justify-between items-start mb-6 border-b pb-6">
                                <h3 className="text-2xl font-bold text-gray-900 border-l-4 border-indigo-600 pl-3">Content Review</h3>
                                <div className="flex gap-2">
                                    {selectedQuestion.originalRawText && (
                                        <button 
                                            onClick={() => setIsSplitView(!isSplitView)}
                                            className={`px-4 py-2 rounded-lg font-bold text-sm transition-all border ${isSplitView ? 'bg-indigo-600 text-white border-indigo-500' : 'bg-white border-gray-200 text-gray-600'}`}
                                        >
                                            <SplitSquareHorizontal className="w-4 h-4 inline mr-2" />
                                            {isSplitView ? 'Exit Split View' : 'Compare Source (OCR)'}
                                        </button>
                                    )}
                                    {!isEditing ? (
                                        <>
                                            <button onClick={() => setIsEditing(true)} className="bg-indigo-100 text-indigo-700 px-4 py-2 rounded-lg font-bold text-sm">Edit</button>
                                            <button onClick={() => handleQAAction(selectedQuestion.id, 'APPROVE')} className="bg-emerald-600 text-white px-4 py-2 rounded-lg font-bold text-sm">Approve</button>
                                            <button onClick={() => handleQAAction(selectedQuestion.id, 'REJECT')} className="bg-red-100 text-red-700 px-4 py-2 rounded-lg font-bold text-sm">Report</button>
                                        </>
                                    ) : (
                                        <>
                                            <button onClick={handleSaveEdit} className="bg-indigo-600 text-white px-4 py-2 rounded-lg font-bold text-sm">Save</button>
                                            <button onClick={() => setIsEditing(false)} className="bg-gray-100 text-gray-700 px-4 py-2 rounded-lg font-bold text-sm">Cancel</button>
                                        </>
                                    )}
                                </div>
                            </div>

                            <div className="flex-1 overflow-y-auto">
                                {isEditing ? (
                                    <div className={`grid grid-cols-1 ${isSplitView ? 'lg:grid-cols-2' : ''} gap-8 h-full`}>
                                        {isSplitView && (
                                            <div className="bg-slate-900 rounded-2xl p-6 border border-slate-800 flex flex-col h-full animate-in slide-in-from-left duration-300">
                                                <div className="flex justify-between items-center mb-4 border-b border-slate-800 pb-4">
                                                    <h4 className="text-white font-black text-xs uppercase tracking-widest flex items-center gap-2">
                                                        <FileText className="w-3 h-3 text-indigo-400" /> Ground Truth (OCR Source)
                                                    </h4>
                                                    <span className="text-[10px] text-slate-500 font-bold">RAW EXTRACTION</span>
                                                </div>
                                                <div className="flex-1 overflow-y-auto text-slate-300 font-mono text-[11px] leading-relaxed select-text bg-black/40 rounded-xl p-4 whitespace-pre-wrap">
                                                    {selectedQuestion.originalRawText}
                                                </div>
                                                <div className="mt-4 pt-4 border-t border-slate-800 text-[10px] text-slate-500 font-bold flex justify-between">
                                                    <span>SOURCE: {selectedQuestion.sourceUrl?.split('/').pop() || 'Ingested Content'}</span>
                                                    <span>UTF-8 CHARS: {selectedQuestion.originalRawText?.length}</span>
                                                </div>
                                            </div>
                                        )}
                                        <div className="space-y-6">
                                            <div className="space-y-2">
                                                <label className="text-[10px] font-black uppercase text-gray-500 ml-1">LaTeX Logic Editor</label>
                                                <textarea 
                                                    value={editForm.content}
                                                    onChange={e => setEditForm({...editForm, content: e.target.value})}
                                                    className="w-full border-2 border-gray-100 focus:border-indigo-500 outline-none p-4 rounded-xl font-mono text-sm h-48 transition-all"
                                                />
                                            </div>
                                            <div className="grid grid-cols-2 gap-4">
                                                {editForm.options.map((opt: string, idx: number) => (
                                                    <div key={idx} className="space-y-1">
                                                        <label className="text-[10px] font-black uppercase text-gray-500 ml-1">Option {String.fromCharCode(65 + idx)}</label>
                                                        <textarea 
                                                            value={opt}
                                                            onChange={e => {
                                                                const newOpts = [...editForm.options];
                                                                newOpts[idx] = e.target.value;
                                                                setEditForm({...editForm, options: newOpts});
                                                            }}
                                                            className="w-full border border-gray-200 focus:border-indigo-400 outline-none p-3 rounded-xl text-xs transition-all"
                                                        />
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    </div>
                                ) : (
                                    <div className={`grid grid-cols-1 ${isSplitView ? 'lg:grid-cols-2' : ''} gap-8 h-full`}>
                                        {isSplitView && (
                                            <div className="bg-slate-900 rounded-2xl p-6 border border-slate-800 flex flex-col h-full animate-in slide-in-from-left duration-300">
                                                <div className="flex justify-between items-center mb-4 border-b border-slate-800 pb-4">
                                                    <h4 className="text-white font-black text-xs uppercase tracking-widest flex items-center gap-2">
                                                        <FileText className="w-3 h-3 text-indigo-400" /> Ground Truth (OCR Source)
                                                    </h4>
                                                    <span className="text-[10px] text-slate-500 font-bold">RAW EXTRACTION</span>
                                                </div>
                                                <div className="flex-1 overflow-y-auto text-slate-300 font-mono text-[11px] leading-relaxed select-text bg-black/40 rounded-xl p-4 whitespace-pre-wrap">
                                                    {selectedQuestion.originalRawText}
                                                </div>
                                            </div>
                                        )}
                                        <div className="bg-gray-50 p-6 rounded-xl border border-gray-200">
                                            <div className="prose max-w-none text-gray-900 text-lg mb-8">
                                                <MathRenderer content={selectedQuestion.content} />
                                            </div>
                                            {selectedQuestion.options && Array.isArray(selectedQuestion.options) && (
                                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                                    {selectedQuestion.options.map((opt: string, idx: number) => (
                                                        <div key={idx} className={`p-4 rounded-xl border-2 flex items-center gap-4 ${selectedQuestion.correctAnswer === String.fromCharCode(65 + idx) ? 'border-emerald-500 bg-emerald-50' : 'border-gray-100'}`}>
                                                            <span className="font-bold">{String.fromCharCode(65 + idx)}</span>
                                                            <MathRenderer content={opt} />
                                                        </div>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    ) : (
                        <div className="h-full flex flex-col items-center justify-center text-gray-400 text-center">
                            <Search className="w-16 h-16 mb-4 text-gray-200" />
                            <h3 className="text-xl font-bold text-gray-500 mb-2">Select a Question</h3>
                            <p>Click on any question from the ledger to perform detailed review.</p>
                        </div>
                    )}
                </div>
            </div>
        </div>
        </div>
    );
}
