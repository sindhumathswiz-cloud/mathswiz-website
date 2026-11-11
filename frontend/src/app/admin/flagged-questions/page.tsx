'use client';

import { useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, Edit3, Loader2, XCircle, User, Clock, Search } from 'lucide-react';
import { toast } from 'react-hot-toast';
import MathRenderer from '@/components/MathRenderer';
import QuestionFilterPanel, { filterLabelCls } from '@/components/question-browser/QuestionFilterPanel';
import { EMPTY_FILTERS, filtersActive, fromParams, toParams, type Facets, type Filters } from '@/components/question-browser/filters';
import type { SourceBook } from '@/lib/question-source-filter';

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
        printedNumber?: string | null;
        sourcePageStart?: number | null;
        book?: { title: string } | null;
        bookChapter?: { name: string; chapterNumber: string | null } | null;
    };
    flaggedBy: { id: string; firstName: string | null; lastName: string | null; email: string | null; role?: string };
    resolvedBy: { id: string; firstName: string | null; lastName: string | null } | null;
}

const FILTERS = ['PENDING', 'CORRECTED', 'REJECTED', 'ALL'] as const;

// The shared question filters (components/question-browser), over the flagged questions, any question status.
const FLAG_DEFAULTS: Filters = { ...EMPTY_FILTERS, status: 'ALL', sort: 'newest' };
const sourceOf = (q: QuestionFlagRow['question']) => [
    q.book?.title,
    q.bookChapter ? `${q.bookChapter.chapterNumber ? `Ch ${q.bookChapter.chapterNumber} ` : ''}${q.bookChapter.name}` : null,
    q.sourcePageStart ? `p. ${q.sourcePageStart}` : null,
    q.printedNumber ? `Q ${q.printedNumber.replace(/^Q\.?\s*/i, '')}` : null,
].filter(Boolean).join(' · ');

// A flag an admin or a review check raised: resolving it saves the correction but leaves the question's status
// alone (it still goes through approval), and there is no student to notify.
const fromStudent = (flag: QuestionFlagRow) => flag.flaggedBy.role === undefined || flag.flaggedBy.role === 'STUDENT';

export default function FlaggedQuestionsPage() {
    const [flags, setFlags] = useState<QuestionFlagRow[]>([]);
    const [loading, setLoading] = useState(true);
    const [filter, setFilter] = useState<typeof FILTERS[number]>('PENDING');
    const [expandedId, setExpandedId] = useState<string | null>(null);
    const [editDraft, setEditDraft] = useState<{ content: string; correctAnswer: string; explanation: string }>({ content: '', correctAnswer: '', explanation: '' });
    const [resolutionNote, setResolutionNote] = useState('');
    const [processingId, setProcessingId] = useState<string | null>(null);
    const [filters, setFilters] = useState<Filters>(FLAG_DEFAULTS);
    const [searchText, setSearchText] = useState('');
    const [raisedBy, setRaisedBy] = useState('');
    const [page, setPage] = useState(1);
    const [total, setTotal] = useState(0);
    const [statusCounts, setStatusCounts] = useState<Record<string, number>>({});
    const [facets, setFacets] = useState<Facets | null>(null);
    const [books, setBooks] = useState<SourceBook[]>([]);
    const [ready, setReady] = useState(false);
    const PAGE_SIZE = 25;
    const updateFilters = (patch: Partial<Filters>) => { setFilters((f) => ({ ...f, ...patch })); setPage(1); };

    // Filters come from the address (a reload or a shared link keeps them); the book tree for the selectors from the server.
    useEffect(() => {
        const params = new URLSearchParams(window.location.search);
        const initial = fromParams(params, FLAG_DEFAULTS);
        setFilters(initial.filters);
        setSearchText(initial.filters.q);
        setPage(initial.page);
        const tab = params.get('flags');
        if (tab && (FILTERS as readonly string[]).includes(tab)) setFilter(tab as typeof FILTERS[number]);
        setRaisedBy(params.get('raisedBy') ?? '');
        fetch('/api/teacher/question-sources').then((r) => r.json()).then((d) => setBooks(d.books ?? [])).catch(() => {});
        setReady(true);
    }, []);
    useEffect(() => {
        if (ready) fetchFlags();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [ready, filter, filters, raisedBy, page]);
    useEffect(() => {
        if (!ready || searchText === filters.q) return;
        const t = setTimeout(() => updateFilters({ q: searchText }), 400);
        return () => clearTimeout(t);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [searchText, ready]);

    const fetchFlags = async () => {
        setLoading(true);
        try {
            const params = toParams(filters, page, PAGE_SIZE, FLAG_DEFAULTS);
            if (filter !== 'PENDING') params.set('flags', filter);
            if (raisedBy) params.set('raisedBy', raisedBy);
            window.history.replaceState(null, '', `${window.location.pathname}${params.toString() ? `?${params}` : ''}`);
            params.delete('flags');
            params.set('status', filter);
            params.set('facets', '1');
            const res = await fetch(`/api/admin/question-flags?${params}`);
            const data = await res.json();
            if (data.flags) {
                setFlags(data.flags);
                setTotal(data.total ?? data.flags.length);
                setStatusCounts(data.statusCounts ?? {});
                setFacets(data.facets ?? null);
            }
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
                const notified = fromStudent(flag) ? ' and student notified' : '';
                toast.success(action === 'CORRECTED' ? `Question corrected${notified}` : `Flag rejected${notified}`);
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

    const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
    const allCount = Object.values(statusCounts).reduce((a, b) => a + b, 0);

    return (
        <div className="p-6 space-y-6 max-w-5xl mx-auto">
            <div>
                <h1 className="font-display text-3xl font-bold text-slate-900 dark:text-white flex items-center gap-3">
                    <AlertTriangle className="w-7 h-7 text-amber-500" />
                    Flagged Questions
                </h1>
                <p className="text-slate-500 mt-1 dark:text-slate-400">Questions students reported as incorrect, and questions a review flagged for fixing — correct them or reject the flag.</p>
            </div>

            <div className="flex flex-wrap gap-2">
                {FILTERS.map((f) => (
                    <button
                        key={f}
                        aria-pressed={filter === f}
                        onClick={() => { setFilter(f); setPage(1); }}
                        className={`px-4 py-2 rounded-lg font-medium text-sm transition-colors ${
                            filter === f
                                ? 'bg-gradient-to-br from-indigo-600 to-violet-600 dark:from-brand dark:to-brand-violet text-white'
                                : 'bg-white dark:bg-surface dark:border-white/10 text-slate-700 dark:text-slate-300 border hover:bg-slate-50 dark:hover:bg-white/5'
                        }`}
                    >
                        {f.charAt(0) + f.slice(1).toLowerCase()} <span className="tabular-nums opacity-70">{f === 'ALL' ? allCount : statusCounts[f] ?? 0}</span>
                    </button>
                ))}
            </div>

            <div className="space-y-4 rounded-2xl border border-slate-200 bg-white p-4 dark:border-white/10 dark:bg-surface">
                <label className="relative block">
                    <span className="sr-only">Search the text of the flagged questions</span>
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                    <input
                        id="flags-search"
                        type="search"
                        value={searchText}
                        onChange={(e) => setSearchText(e.target.value)}
                        placeholder="Search the question text or paste a question id"
                        className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-9 pr-3 text-sm outline-none focus:ring-2 focus:ring-indigo-500 dark:border-white/10 dark:bg-surface dark:text-white"
                    />
                </label>
                <QuestionFilterPanel
                    layout="bar"
                    filters={filters}
                    onChange={updateFilters}
                    onReset={() => { setFilters(FLAG_DEFAULTS); setSearchText(''); setRaisedBy(''); setPage(1); }}
                    active={filtersActive({ ...filters, q: searchText }, FLAG_DEFAULTS) || raisedBy !== ''}
                    books={books}
                    facets={facets}
                >
                    <label className="block">
                        <span className={filterLabelCls}>Raised by</span>
                        <select id="flags-raised-by" value={raisedBy} onChange={(e) => { setRaisedBy(e.target.value); setPage(1); }} className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-sm text-slate-800 dark:border-white/10 dark:bg-surface dark:text-slate-200">
                            <option value="">Anyone</option>
                            <option value="student">Students</option>
                            <option value="review">Admin reviews and checks</option>
                        </select>
                    </label>
                </QuestionFilterPanel>
                <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
                    <p data-testid="flags-count" className="font-bold text-slate-600 dark:text-slate-300">
                        {loading ? <span className="inline-flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</span>
                            : total === 0 ? 'No flags match' : `${((page - 1) * PAGE_SIZE + 1).toLocaleString('en-IN')}–${Math.min(page * PAGE_SIZE, total).toLocaleString('en-IN')} of ${total.toLocaleString('en-IN')} flags`}
                    </p>
                    <div className="flex items-center gap-2">
                        <select id="flags-sort" aria-label="Order" value={filters.sort} onChange={(e) => updateFilters({ sort: e.target.value as Filters['sort'] })} className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 dark:border-white/10 dark:bg-surface dark:text-slate-200">
                            <option value="newest">Newest flags first</option>
                            <option value="book">Book order</option>
                        </select>
                        <button type="button" disabled={page <= 1 || loading} onClick={() => setPage((n) => n - 1)} className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 font-bold disabled:opacity-40 dark:border-white/10 dark:bg-surface dark:text-slate-200">Previous</button>
                        <span className="font-bold tabular-nums text-slate-600 dark:text-slate-300">{page} / {pages}</span>
                        <button type="button" disabled={page >= pages || loading} onClick={() => setPage((n) => n + 1)} className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 font-bold disabled:opacity-40 dark:border-white/10 dark:bg-surface dark:text-slate-200">Next</button>
                    </div>
                </div>
            </div>

            {flags.length === 0 && !loading ? (
                <div className="bg-white p-12 rounded-xl border dark:border-white/10 text-center dark:bg-surface">
                    <CheckCircle2 className="w-16 h-16 text-emerald-300 mx-auto mb-4" />
                    <h3 className="font-display text-lg font-semibold text-slate-700 dark:text-slate-300">Nothing here</h3>
                    <p className="text-slate-500 mt-1 dark:text-slate-400">No {filter !== 'ALL' ? filter.toLowerCase() : ''} flagged questions match these filters.</p>
                </div>
            ) : (
                <div className="grid gap-4">
                    {flags.map((flag) => (
                        <div key={flag.id} className="bg-white dark:bg-surface rounded-xl border dark:border-white/10 shadow-sm overflow-hidden">
                            <div className="p-6">
                                <div className="flex items-start justify-between gap-4 mb-4">
                                    <div className="flex items-center gap-3 text-xs font-bold text-slate-500 dark:text-slate-400">
                                        <span className="flex items-center gap-1"><User className="w-3.5 h-3.5" />{studentName(flag.flaggedBy)}{!fromStudent(flag) && ' (admin review)'}</span>
                                        <span className="flex items-center gap-1"><Clock className="w-3.5 h-3.5" />{new Date(flag.createdAt).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}</span>
                                        {flag.question.topic && <span className="px-2 py-0.5 rounded-full bg-indigo-50 dark:bg-brand/10 text-indigo-700 dark:text-brand">{flag.question.topic}</span>}
                                        {sourceOf(flag.question) && <span className="font-medium text-slate-400 dark:text-slate-500">{sourceOf(flag.question)}</span>}
                                    </div>
                                    <span className={`text-[10px] font-black uppercase tracking-widest px-2.5 py-1 rounded-lg shrink-0 ${
                                        flag.status === 'PENDING' ? 'bg-amber-100 text-amber-700 dark:bg-amber-500/10 dark:text-amber-400' :
                                        flag.status === 'CORRECTED' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400' :
                                        'bg-slate-100 text-slate-600 dark:bg-white/5 dark:text-slate-400'
                                    }`}>{flag.status}</span>
                                </div>

                                <div className="mb-3 text-sm font-bold text-slate-900 dark:text-white"><MathRenderer content={flag.question.content} /></div>

                                <div className="mb-4 rounded-xl bg-rose-50 dark:bg-rose-500/10 border border-rose-100 dark:border-rose-500/20 p-4">
                                    <p className="text-[10px] font-black text-rose-600 dark:text-rose-400 uppercase tracking-widest mb-1">{fromStudent(flag) ? "Student's reason" : 'Why it was flagged'}</p>
                                    <p className="text-sm text-rose-900 dark:text-rose-300 whitespace-pre-line">{flag.reason}</p>
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
                                        <MathPreview text={editDraft.content} />
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
                                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-2">Resolution note{fromStudent(flag) ? ' (sent to student)' : ''}</label>
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
                                            rows={fromStudent(flag) ? 3 : 8}
                                            className="w-full bg-white dark:bg-surface border dark:border-white/10 rounded-xl p-3 text-sm font-mono focus:ring-2 focus:ring-indigo-500 outline-none"
                                        />
                                        <MathPreview text={editDraft.explanation} />
                                    </div>
                                    <button
                                        onClick={() => resolve(flag, 'CORRECTED')}
                                        disabled={processingId === flag.id}
                                        className="flex items-center gap-2 px-6 py-3 rounded-xl font-black text-sm text-white bg-gradient-to-br from-emerald-600 to-emerald-700 hover:opacity-90 transition disabled:opacity-50"
                                    >
                                        {processingId === flag.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />} {fromStudent(flag) ? 'Save Correction & Notify Student' : 'Save Correction'}
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

/** How the text being edited will display to students, so a maths fix can be checked before it is saved. */
function MathPreview({ text }: { text: string }) {
    if (!text.trim()) return null;
    return (
        <div className="mt-2 rounded-xl border border-dashed dark:border-white/10 bg-white dark:bg-surface p-3">
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Preview</p>
            <div className="text-sm text-slate-800 dark:text-slate-200"><MathRenderer content={text} /></div>
        </div>
    );
}
