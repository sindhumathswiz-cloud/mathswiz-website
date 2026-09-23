'use client';

import { useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, Edit3, Loader2, XCircle, User, Clock } from 'lucide-react';
import { toast } from 'react-hot-toast';
import MathRenderer from '@/components/MathRenderer';

interface QuestionFlagRow {
    id: string;
    reason: string;
    status: 'PENDING' | 'CORRECTED' | 'REJECTED';
    resolution: string | null;
    createdAt: string;
    question: {
        id: string;
        content: string;
        options: string[] | null;
        correctAnswer: string | null;
        explanation: string | null;
        type: string;
        status: string;
        topic: string | null;
        subject: string | null;
        difficulty: string;
    };
    flaggedBy: { id: string; firstName: string | null; lastName: string | null; email: string | null };
    resolvedBy: { id: string; firstName: string | null; lastName: string | null } | null;
}

const FILTERS = ['PENDING', 'CORRECTED', 'REJECTED', 'ALL'] as const;

export default function FlaggedQuestionsPage() {
    const [flags, setFlags] = useState<QuestionFlagRow[]>([]);
    const [loading, setLoading] = useState(true);
    const [filter, setFilter] = useState<typeof FILTERS[number]>('PENDING');
    const [expandedId, setExpandedId] = useState<string | null>(null);
    const [editDraft, setEditDraft] = useState<{ content: string; correctAnswer: string; explanation: string }>({ content: '', correctAnswer: '', explanation: '' });
    const [resolutionNote, setResolutionNote] = useState('');
    const [processingId, setProcessingId] = useState<string | null>(null);

    useEffect(() => {
        fetchFlags();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [filter]);

    const fetchFlags = async () => {
        setLoading(true);
        try {
            const res = await fetch(`/api/admin/question-flags?status=${filter}`);
            const data = await res.json();
            if (data.flags) setFlags(data.flags);
        } catch {
            toast.error('Failed to load flagged questions');
        } finally {
            setLoading(false);
        }
    };

    const openEditor = (flag: QuestionFlagRow) => {
        if (expandedId === flag.id) {
            setExpandedId(null);
            return;
        }
        setExpandedId(flag.id);
        setEditDraft({
            content: flag.question.content,
            correctAnswer: flag.question.correctAnswer || '',
            explanation: flag.question.explanation || '',
        });
        setResolutionNote('');
    };

    const resolve = async (flag: QuestionFlagRow, action: 'CORRECTED' | 'REJECTED') => {
        setProcessingId(flag.id);
        try {
            const res = await fetch(`/api/admin/question-flags/${flag.id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    action,
                    resolution: resolutionNote || undefined,
                    questionUpdate: action === 'CORRECTED' ? editDraft : undefined,
                }),
            });
            const data = await res.json();
            if (data.success) {
                toast.success(action === 'CORRECTED' ? 'Question corrected and student notified' : 'Flag rejected and student notified');
                setExpandedId(null);
                fetchFlags();
            } else {
                toast.error(data.error || 'Action failed');
            }
        } catch {
            toast.error('Network error');
        } finally {
            setProcessingId(null);
        }
    };

    const studentName = (u: QuestionFlagRow['flaggedBy']) => (u.firstName || u.lastName ? `${u.firstName || ''} ${u.lastName || ''}`.trim() : u.email || 'Student');

    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-screen">
                <Loader2 className="w-10 h-10 animate-spin text-indigo-600 dark:text-brand" />
            </div>
        );
    }

    return (
        <div className="p-6 space-y-6 max-w-5xl mx-auto">
            <div>
                <h1 className="font-display text-3xl font-bold text-slate-900 dark:text-white flex items-center gap-3">
                    <AlertTriangle className="w-7 h-7 text-amber-500" />
                    Flagged Questions
                </h1>
                <p className="text-slate-500 mt-1 dark:text-slate-400">Questions students reported as incorrect — correct them or reject the flag.</p>
            </div>

            <div className="flex gap-2">
                {FILTERS.map((f) => (
                    <button
                        key={f}
                        onClick={() => setFilter(f)}
                        className={`px-4 py-2 rounded-lg font-medium text-sm transition-colors ${
                            filter === f
                                ? 'bg-gradient-to-br from-indigo-600 to-violet-600 dark:from-brand dark:to-brand-violet text-white'
                                : 'bg-white dark:bg-surface dark:border-white/10 text-slate-700 dark:text-slate-300 border hover:bg-slate-50 dark:hover:bg-white/5'
                        }`}
                    >
                        {f.charAt(0) + f.slice(1).toLowerCase()}
                    </button>
                ))}
            </div>

            {flags.length === 0 ? (
                <div className="bg-white p-12 rounded-xl border dark:border-white/10 text-center dark:bg-surface">
                    <CheckCircle2 className="w-16 h-16 text-emerald-300 mx-auto mb-4" />
                    <h3 className="font-display text-lg font-semibold text-slate-700 dark:text-slate-300">Nothing here</h3>
                    <p className="text-slate-500 mt-1 dark:text-slate-400">No {filter !== 'ALL' ? filter.toLowerCase() : ''} flagged questions.</p>
                </div>
            ) : (
                <div className="grid gap-4">
                    {flags.map((flag) => (
                        <div key={flag.id} className="bg-white dark:bg-surface rounded-xl border dark:border-white/10 shadow-sm overflow-hidden">
                            <div className="p-6">
                                <div className="flex items-start justify-between gap-4 mb-4">
                                    <div className="flex items-center gap-3 text-xs font-bold text-slate-500 dark:text-slate-400">
                                        <span className="flex items-center gap-1"><User className="w-3.5 h-3.5" />{studentName(flag.flaggedBy)}</span>
                                        <span className="flex items-center gap-1"><Clock className="w-3.5 h-3.5" />{new Date(flag.createdAt).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}</span>
                                        {flag.question.topic && <span className="px-2 py-0.5 rounded-full bg-indigo-50 dark:bg-brand/10 text-indigo-700 dark:text-brand">{flag.question.topic}</span>}
                                    </div>
                                    <span className={`text-[10px] font-black uppercase tracking-widest px-2.5 py-1 rounded-lg shrink-0 ${
                                        flag.status === 'PENDING' ? 'bg-amber-100 text-amber-700 dark:bg-amber-500/10 dark:text-amber-400' :
                                        flag.status === 'CORRECTED' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400' :
                                        'bg-slate-100 text-slate-600 dark:bg-white/5 dark:text-slate-400'
                                    }`}>{flag.status}</span>
                                </div>

                                <div className="mb-3 text-sm font-bold text-slate-900 dark:text-white"><MathRenderer content={flag.question.content} /></div>

                                <div className="mb-4 rounded-xl bg-rose-50 dark:bg-rose-500/10 border border-rose-100 dark:border-rose-500/20 p-4">
                                    <p className="text-[10px] font-black text-rose-600 dark:text-rose-400 uppercase tracking-widest mb-1">Student's reason</p>
                                    <p className="text-sm text-rose-900 dark:text-rose-300">{flag.reason}</p>
                                </div>

                                {flag.status !== 'PENDING' && (
                                    <div className="rounded-xl bg-slate-50 dark:bg-white/5 p-4 text-sm text-slate-600 dark:text-slate-400">
                                        Resolved by {flag.resolvedBy ? studentName(flag.resolvedBy as any) : 'admin'}
                                        {flag.resolution && <>: {flag.resolution}</>}
                                    </div>
                                )}

                                {flag.status === 'PENDING' && (
                                    <div className="flex items-center gap-2">
                                        <button
                                            onClick={() => openEditor(flag)}
                                            className="flex items-center gap-2 px-4 py-2 rounded-lg font-bold text-sm border dark:border-white/10 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-white/5 transition-colors"
                                        >
                                            <Edit3 className="w-4 h-4" /> {expandedId === flag.id ? 'Close' : 'Review & Correct'}
                                        </button>
                                        <button
                                            onClick={() => resolve(flag, 'REJECTED')}
                                            disabled={processingId === flag.id}
                                            className="flex items-center gap-2 px-4 py-2 rounded-lg font-bold text-sm border dark:border-white/10 text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-white/5 transition-colors disabled:opacity-50"
                                        >
                                            {processingId === flag.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <XCircle className="w-4 h-4" />} Reject Flag
                                        </button>
                                    </div>
                                )}
                            </div>

                            {expandedId === flag.id && (
                                <div className="border-t dark:border-white/10 bg-slate-50 dark:bg-white/[0.02] p-6 space-y-4">
                                    <div>
                                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-2">Question content</label>
                                        <textarea
                                            value={editDraft.content}
                                            onChange={(e) => setEditDraft({ ...editDraft, content: e.target.value })}
                                            rows={3}
                                            className="w-full bg-white dark:bg-surface border dark:border-white/10 rounded-xl p-3 text-sm font-mono focus:ring-2 focus:ring-indigo-500 outline-none"
                                        />
                                    </div>
                                    <div className="grid grid-cols-2 gap-4">
                                        <div>
                                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-2">Correct answer</label>
                                            <input
                                                value={editDraft.correctAnswer}
                                                onChange={(e) => setEditDraft({ ...editDraft, correctAnswer: e.target.value })}
                                                className="w-full bg-white dark:bg-surface border dark:border-white/10 rounded-xl p-3 text-sm font-mono focus:ring-2 focus:ring-indigo-500 outline-none"
                                            />
                                        </div>
                                        <div>
                                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-2">Resolution note (sent to student)</label>
                                            <input
                                                value={resolutionNote}
                                                onChange={(e) => setResolutionNote(e.target.value)}
                                                placeholder="What was fixed?"
                                                className="w-full bg-white dark:bg-surface border dark:border-white/10 rounded-xl p-3 text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                                            />
                                        </div>
                                    </div>
                                    <div>
                                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-2">Explanation</label>
                                        <textarea
                                            value={editDraft.explanation}
                                            onChange={(e) => setEditDraft({ ...editDraft, explanation: e.target.value })}
                                            rows={3}
                                            className="w-full bg-white dark:bg-surface border dark:border-white/10 rounded-xl p-3 text-sm font-mono focus:ring-2 focus:ring-indigo-500 outline-none"
                                        />
                                    </div>
                                    <button
                                        onClick={() => resolve(flag, 'CORRECTED')}
                                        disabled={processingId === flag.id}
                                        className="flex items-center gap-2 px-6 py-3 rounded-xl font-black text-sm text-white bg-gradient-to-br from-emerald-600 to-emerald-700 hover:opacity-90 transition disabled:opacity-50"
                                    >
                                        {processingId === flag.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />} Save Correction & Notify Student
                                    </button>
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
