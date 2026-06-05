'use client';

import { useMemo } from 'react';
import { AlertTriangle, XCircle } from 'lucide-react';
import { analyzeQuestion, type QAQuestion } from '@/lib/question-qa';

/**
 * Shows QA issues (broken LaTeX, missing/mismatched answers, missing options,
 * missing premise data) for a question. Renders nothing when the question is
 * clean, so the review queue only highlights problems. Memoized because the
 * LaTeX check runs KaTeX per math block.
 */
export default function QAFlags({ q, className = '' }: { q: QAQuestion; className?: string }) {
    const issues = useMemo(
        () => analyzeQuestion(q),
        [q.content, q.explanation, q.correctAnswer, q.type, JSON.stringify(q.options)]
    );

    if (issues.length === 0) return null;

    const hasError = issues.some((i) => i.severity === 'error');

    return (
        <div
            className={`rounded-lg border p-2 space-y-1 ${hasError ? 'bg-red-500/10 border-red-500/30' : 'bg-amber-500/10 border-amber-500/30'} ${className}`}
        >
            <div className="text-[9px] font-black uppercase tracking-widest text-slate-400 flex items-center gap-1">
                QA Review — {issues.length} issue{issues.length > 1 ? 's' : ''}
            </div>
            {issues.map((i, idx) => (
                <div
                    key={idx}
                    className={`flex items-center gap-1.5 text-[11px] font-semibold ${i.severity === 'error' ? 'text-red-300' : 'text-amber-300'}`}
                >
                    {i.severity === 'error'
                        ? <XCircle className="w-3 h-3 shrink-0" />
                        : <AlertTriangle className="w-3 h-3 shrink-0" />}
                    {i.message}
                </div>
            ))}
        </div>
    );
}
