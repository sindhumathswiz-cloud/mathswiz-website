'use client';

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useSession } from 'next-auth/react';
import {
    Save, CheckCircle2, AlertCircle, FileEdit, Upload,
    Loader2, Tag, X, BrainCircuit, ChevronLeft
} from 'lucide-react';
import Link from 'next/link';
import MathRenderer from '@/components/MathRenderer';
import GlobalMathToolbar from '@/components/GlobalMathToolbar';

export default function TeacherQuestionStudio() {
    const { data: session } = useSession();

    // Problem fields
    const [content, setContent] = useState('');
    const [options, setOptions] = useState(['', '', '', '']);
    const [correctAnswer, setCorrectAnswer] = useState('');
    const [explanation, setExplanation] = useState('');
    const [tags, setTags] = useState<string[]>([]);
    const [tagInput, setTagInput] = useState('');

    // Taxonomy
    const [type, setType] = useState('SINGLE_CHOICE');
    const [difficulty, setDifficulty] = useState('MEDIUM');
    const [classLevel, setClassLevel] = useState('Class 12');
    const [subject, setSubject] = useState('Mathematics');
    const [examType, setExamType] = useState('Board');

    // UI state
    const [isAI, setIsAI] = useState(false);
    const [message, setMessage] = useState<{ text: string; type: 'error' | 'success' } | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const showMsg = (text: string, type: 'error' | 'success') => {
        setMessage({ text, type });
        setTimeout(() => setMessage(null), 4000);
    };

    // Paste handler for AI snippets
    useEffect(() => {
        const onPaste = async (e: ClipboardEvent) => {
            const items = e.clipboardData?.items;
            if (!items) return;
            for (let i = 0; i < items.length; i++) {
                if (items[i].type.startsWith('image/')) {
                    const blob = items[i].getAsFile();
                    if (blob) await runAI(blob);
                }
            }
        };
        window.addEventListener('paste', onPaste);
        return () => window.removeEventListener('paste', onPaste);
    }, []);

    const runAI = async (file: File) => {
        setIsAI(true);
        try {
            const reader = new FileReader();
            const base64 = await new Promise<string>(resolve => { reader.onload = e => resolve(e.target!.result as string); reader.readAsDataURL(file); });
            const res = await fetch('/api/extract-vision', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ fileBase64: base64, mimeType: file.type })
            });
            const data = await res.json();
            if (data.error) throw new Error(data.details || data.error);
            const q = Array.isArray(data) ? data[0] : data;
            if (q) {
                if (q.questionContent) setContent(q.questionContent);
                if (Array.isArray(q.options)) setOptions([...q.options, '', '', ''].slice(0, 4));
                if (q.correctAnswer) setCorrectAnswer(q.correctAnswer);
                if (q.explanation) setExplanation(q.explanation);
                if (Array.isArray(q.tags)) setTags(prev => [...new Set([...prev, ...q.tags])]);
                showMsg('AI extracted the question successfully!', 'success');
            }
        } catch (err: any) {
            showMsg('AI parse failed: ' + err.message, 'error');
        } finally {
            setIsAI(false);
            if (fileInputRef.current) fileInputRef.current.value = '';
        }
    };

    const handleSave = async (status: 'DRAFT' | 'PENDING_REVIEW') => {
        if (!content.trim()) return showMsg('Problem statement cannot be empty.', 'error');
        try {
            const res = await fetch('/api/questions', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    content, options: options.some(o => o.trim()) ? options : undefined,
                    correctAnswer: correctAnswer || undefined, explanation: explanation || undefined,
                    type, difficulty, subject, class: classLevel, examType, tags, status,
                    createdById: (session?.user as any)?.id || 'teacher'
                })
            });
            if (!res.ok) { const d = await res.json(); throw new Error(d.error || 'Save failed'); }
            showMsg(status === 'DRAFT' ? 'Saved as draft!' : 'Submitted for admin review!', 'success');
            // Reset
            setContent(''); setOptions(['', '', '', '']); setCorrectAnswer(''); setExplanation(''); setTags([]);
        } catch (err: any) {
            showMsg(err.message, 'error');
        }
    };

    const addTag = () => {
        const t = tagInput.trim();
        if (t && !tags.includes(t)) setTags(prev => [...prev, t]);
        setTagInput('');
    };

    return (
        <div className="min-h-screen bg-slate-50 flex flex-col font-sans">

            {/* ── Header ── */}
            <div className="bg-white border-b border-slate-200 px-6 py-3 flex items-center gap-4 shadow-sm sticky top-0 z-40">
                <Link href="/teacher/dashboard" className="text-slate-500 hover:text-slate-800 transition-colors">
                    <ChevronLeft className="w-5 h-5" />
                </Link>
                <div className="flex items-center gap-3">
                    <div className="w-9 h-9 bg-indigo-100 rounded-xl flex items-center justify-center">
                        <FileEdit className="w-5 h-5 text-indigo-600" />
                    </div>
                    <div>
                        <h1 className="text-base font-black text-slate-900">Content Creator Studio</h1>
                        <p className="text-[10px] text-slate-500 uppercase tracking-widest font-bold">Teacher Workspace</p>
                    </div>
                </div>
                <div className="ml-auto flex items-center gap-4">
                    {/* Compact math toolbar in header */}
                    <GlobalMathToolbar className="hidden md:block" />
                    <button onClick={() => handleSave('DRAFT')}
                        className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl transition text-xs flex items-center gap-2 border border-slate-300">
                        <Save className="w-3.5 h-3.5" /> Draft
                    </button>
                    <button onClick={() => handleSave('PENDING_REVIEW')}
                        className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl shadow transition text-xs flex items-center gap-2">
                        <CheckCircle2 className="w-3.5 h-3.5" /> Submit for Review
                    </button>
                </div>
            </div>

            {/* ── Toast ── */}
            {message && (
                <div className={`fixed top-20 left-1/2 -translate-x-1/2 z-50 px-5 py-3 rounded-xl shadow-2xl text-white text-sm font-bold flex items-center gap-2 border ${message.type === 'error' ? 'bg-red-500 border-red-400' : 'bg-emerald-500 border-emerald-400'}`}>
                    {message.type === 'error' ? <AlertCircle className="w-4 h-4" /> : <CheckCircle2 className="w-4 h-4" />}
                    {message.text}
                </div>
            )}

            <div className="max-w-7xl mx-auto w-full px-6 mt-8 grid grid-cols-1 lg:grid-cols-4 gap-6 pb-24">

                {/* ── LEFT COLUMN: Taxonomy + AI ── */}
                <div className="lg:col-span-1 space-y-5">

                    {/* AI Smart Snippet Zone */}
                    <div className="bg-white rounded-2xl border border-indigo-100 shadow p-5">
                        <h3 className="font-black text-slate-900 text-sm flex items-center gap-2 mb-4">
                            <BrainCircuit className="w-4 h-4 text-indigo-500" /> AI Snippet Zone
                        </h3>
                        <div
                            onClick={() => fileInputRef.current?.click()}
                            className="aspect-video border-2 border-dashed border-indigo-200 hover:border-indigo-400 bg-indigo-50/50 rounded-xl flex flex-col items-center justify-center cursor-pointer transition-all group"
                        >
                            {isAI ? (
                                <>
                                    <Loader2 className="w-8 h-8 text-indigo-500 animate-spin mb-2" />
                                    <span className="text-[11px] font-bold text-indigo-600 uppercase tracking-widest">Parsing…</span>
                                </>
                            ) : (
                                <>
                                    <Upload className="w-8 h-8 text-indigo-200 group-hover:text-indigo-400 transition-colors mb-2" />
                                    <p className="text-xs font-semibold text-slate-500 text-center px-4">Click to upload or <span className="text-indigo-500 font-bold">Ctrl+V</span> to paste screenshot</p>
                                </>
                            )}
                            <input type="file" ref={fileInputRef} className="hidden" accept="image/*"
                                onChange={e => { if (e.target.files?.[0]) runAI(e.target.files[0]); }} />
                        </div>
                    </div>

                    {/* Taxonomy */}
                    <div className="bg-white rounded-2xl border border-slate-200 shadow p-5 space-y-4">
                        <h3 className="font-black text-slate-900 text-sm border-b border-slate-100 pb-3">Categorization</h3>

                        {[
                            { label: 'Class', value: classLevel, setter: setClassLevel, opts: ['Class 12', 'Class 11', 'NDA', 'CUET'] },
                            { label: 'Subject', value: subject, setter: setSubject, opts: ['Mathematics', 'Physics', 'Chemistry'] },
                            { label: 'Exam Type', value: examType, setter: setExamType, opts: ['Board', 'NDA', 'CUET', 'JEE'] },
                            { label: 'Format', value: type, setter: setType, opts: ['SINGLE_CHOICE', 'MULTIPLE_CHOICE', 'INTEGER', 'SUBJECTIVE'] },
                            { label: 'Difficulty', value: difficulty, setter: setDifficulty, opts: ['EASY', 'MEDIUM', 'HARD'] },
                        ].map(({ label, value, setter, opts }) => (
                            <div key={label}>
                                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block mb-1">{label}</label>
                                <select value={value} onChange={e => setter(e.target.value)}
                                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-sm font-semibold text-slate-700 outline-none focus:border-indigo-500">
                                    {opts.map(o => <option key={o}>{o}</option>)}
                                </select>
                            </div>
                        ))}

                        {/* Tags */}
                        <div>
                            <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block mb-2 flex items-center gap-1">
                                <Tag className="w-3 h-3" /> Tags
                            </label>
                            <div className="flex flex-wrap gap-1.5 p-2 bg-slate-50 border border-slate-200 rounded-xl min-h-[44px] mb-2">
                                {tags.map(t => (
                                    <span key={t} className="bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded text-[10px] font-bold flex items-center gap-1">
                                        {t} <X className="w-2.5 h-2.5 cursor-pointer hover:text-red-500" onClick={() => setTags(tags.filter(x => x !== t))} />
                                    </span>
                                ))}
                            </div>
                            <div className="flex gap-2">
                                <input type="text" value={tagInput} onChange={e => setTagInput(e.target.value)}
                                    onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addTag(); } }}
                                    placeholder="Type tag & press Enter"
                                    className="flex-1 bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5 text-xs outline-none focus:border-indigo-500 font-semibold text-slate-700" />
                                <button onClick={addTag} className="px-3 py-1.5 bg-indigo-100 hover:bg-indigo-200 text-indigo-700 rounded-xl text-xs font-bold transition">Add</button>
                            </div>
                        </div>
                    </div>
                </div>

                {/* ── RIGHT COLUMN: Editor+Preview ── */}
                <div className="lg:col-span-3 space-y-5">

                    {/* Live Student Preview strip */}
                    <div className="bg-slate-900 rounded-2xl p-5 relative">
                        <div className="absolute top-0 right-0 px-3 py-1 bg-indigo-500 text-[10px] font-black text-white uppercase tracking-widest rounded-bl-xl rounded-tr-2xl">Live Preview</div>
                        <div className="mt-3 min-h-12 select-none pointer-events-none text-slate-200">
                            <MathRenderer content={content || '*(Start typing below…)*'} />
                        </div>
                    </div>

                    {/* Content field */}
                    <SideBySideField
                        label="Problem Statement (LaTeX)"
                        value={content} onChange={setContent} rows={5}
                    />

                    {/* Options */}
                    <div>
                        <label className="text-xs font-black text-slate-500 uppercase tracking-widest block mb-3">Answer Options</label>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {options.map((opt, oIdx) => (
                                <div key={oIdx} className="space-y-1">
                                    <div className="text-[10px] font-black text-indigo-500 uppercase tracking-widest pl-1">{String.fromCharCode(65 + oIdx)}</div>
                                    <SideBySideField label="" value={opt} onChange={v => { const n = [...options]; n[oIdx] = v; setOptions(n); }} rows={2} compact />
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Correct + Explanation */}
                    <div className="grid grid-cols-4 gap-4">
                        <div className="col-span-1 space-y-1">
                            <label className="text-xs font-black text-slate-500 uppercase tracking-widest block">Correct</label>
                            <input value={correctAnswer} onChange={e => setCorrectAnswer(e.target.value.toUpperCase())}
                                placeholder="A"
                                className="w-full bg-emerald-50 border border-emerald-200 rounded-2xl py-4 text-center text-xl text-emerald-600 font-black outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 transition-all" />
                        </div>
                        <div className="col-span-3">
                            <SideBySideField label="Explanation" value={explanation} onChange={setExplanation} rows={4} />
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}

// ── Sub-component: SideBySideField ───────────────────────────────────────────
function SideBySideField({ label, value, onChange, rows, compact }: {
    label: string; value: string; onChange: (v: string) => void; rows: number; compact?: boolean;
}) {
    return (
        <div className={compact ? '' : 'space-y-1.5'}>
            {label && <label className="text-xs font-black text-slate-500 uppercase tracking-widest block">{label}</label>}
            <div className="grid grid-cols-2 gap-3">
                <textarea
                    value={value}
                    onChange={e => onChange(e.target.value)}
                    rows={rows}
                    placeholder="LaTeX source…"
                    className="w-full bg-slate-50 border border-slate-200 rounded-2xl p-4 text-sm font-mono text-slate-800 resize-none outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 transition-all shadow-inner"
                />
                <div
                    className="bg-white border border-slate-200 rounded-2xl p-4 text-sm text-slate-900 overflow-auto select-none pointer-events-none shadow-inner"
                    style={{ minHeight: `${rows * 1.75}rem` }}
                    onContextMenu={e => e.preventDefault()}
                >
                    <MathRenderer content={value || '*(empty)*'} />
                </div>
            </div>
        </div>
    );
}
