'use client';

import React from 'react';
import Link from 'next/link';
import { ClipboardList, Clock, Calendar, PlayCircle, CheckCircle, Lock, Trophy, TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { summarizeMockExam, type Trend } from '@/lib/mock-exam-list';

interface MockTestsClientProps {
    assignments: any[];
}

const TREND: Record<Exclude<Trend, null>, { icon: typeof TrendingUp; label: string; tone: string }> = {
    UP: { icon: TrendingUp, label: 'Up on your previous attempt', tone: 'text-emerald-600 dark:text-emerald-400' },
    DOWN: { icon: TrendingDown, label: 'Down on your previous attempt', tone: 'text-rose-600 dark:text-rose-400' },
    FLAT: { icon: Minus, label: 'Same as your previous attempt', tone: 'text-slate-500 dark:text-slate-400' },
};

export default function MockTestsClient({ assignments }: MockTestsClientProps) {
    return (
        <div className="p-6 md:p-10 max-w-5xl mx-auto dark:bg-background min-h-screen">
            <div className="mb-8">
                <div className="flex items-center gap-2 mb-2">
                    <Trophy className="w-6 h-6 text-indigo-600 dark:text-brand" />
                    <h1 className="font-display text-2xl font-black text-slate-900 dark:text-white">Mock Exams</h1>
                </div>
                <p className="text-slate-500 dark:text-slate-400 font-medium text-sm">Full-length, timed papers in the pattern of the real exam: sections, marking scheme and time limit included.</p>
            </div>

            {assignments.length === 0 ? (
                <div className="text-center py-16 border-2 border-dashed border-gray-200 dark:border-white/10 rounded-2xl">
                    <ClipboardList className="w-12 h-12 text-gray-300 dark:text-slate-600 mx-auto mb-3" />
                    <p className="text-gray-500 dark:text-slate-400 font-medium">No mock exams assigned yet.</p>
                </div>
            ) : (
                <div className="space-y-4">
                    {assignments.map((assignment: any) => {
                        const now = new Date();
                        const opens = assignment.scheduledFor ? new Date(assignment.scheduledFor) : null;
                        const closes = assignment.deadline ? new Date(assignment.deadline) : null;
                        const isOpen = (!opens || now >= opens) && (!closes || now <= closes);
                        const isExpired = closes && now > closes;
                        const summary = summarizeMockExam(assignment.test ?? {});
                        const maxAttempts = assignment.maxAttempts || 1;
                        const attemptsLeft = Math.max(0, maxAttempts - summary.attemptsUsed);
                        const trend = summary.trend ? TREND[summary.trend] : null;
                        const TrendIcon = trend?.icon;
                        return (
                            <div key={assignment.id} className="border border-gray-200 dark:border-white/10 bg-white dark:bg-surface rounded-2xl p-6 flex flex-col md:flex-row items-start md:items-center justify-between gap-5 hover:shadow-md transition">
                                <div className="min-w-0 flex-1">
                                    <div className="flex flex-wrap items-center gap-2 mb-2">
                                        <span className="text-[10px] font-black uppercase tracking-widest px-2.5 py-1 rounded-lg bg-indigo-100 dark:bg-brand/10 text-indigo-700 dark:text-brand">{summary.patternName ?? 'Mock Exam'}</span>
                                        {isExpired && <span className="text-[10px] font-black uppercase tracking-widest px-2.5 py-1 rounded-lg bg-gray-100 dark:bg-white/5 text-gray-500 dark:text-slate-400">Expired</span>}
                                    </div>
                                    <h3 className="text-lg font-black text-gray-900 dark:text-white">{assignment.test?.title}</h3>
                                    {assignment.instructions && <p className="text-sm text-gray-600 dark:text-slate-400 mt-1">{assignment.instructions}</p>}

                                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-gray-500 dark:text-slate-400 font-medium mt-2">
                                        <span className="flex items-center gap-1"><Clock className="w-3.5 h-3.5" />{assignment.test?.duration} mins</span>
                                        {summary.totalQuestions > 0 && <span>{summary.totalQuestions} questions</span>}
                                        <span>{summary.maxMarks} marks</span>
                                        {opens && <span className="flex items-center gap-1"><Calendar className="w-3.5 h-3.5" />Opens: {opens.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</span>}
                                        {closes && <span className="flex items-center gap-1"><Calendar className="w-3.5 h-3.5" />Due: {closes.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</span>}
                                    </div>

                                    {summary.sections.length > 0 && (
                                        <ul className="mt-3 flex flex-wrap gap-2" aria-label="Sections">
                                            {summary.sections.map(section => (
                                                <li key={section.title} className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-bold text-slate-600 dark:border-white/10 dark:bg-white/5 dark:text-slate-300">
                                                    {section.title} · {section.questions}{section.rule ? ` (attempt ${section.rule})` : ''}
                                                </li>
                                            ))}
                                        </ul>
                                    )}

                                    {summary.attemptsUsed > 0 && (
                                        <p className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs font-bold text-slate-600 dark:text-slate-300 tabular-nums">
                                            <span>Best {summary.bestScore} / {summary.maxMarks}</span>
                                            <span>Last {summary.lastScore} / {summary.maxMarks}</span>
                                            {trend && TrendIcon && <span className={`inline-flex items-center gap-1 ${trend.tone}`}><TrendIcon className="h-3.5 w-3.5" aria-hidden />{trend.label}</span>}
                                        </p>
                                    )}
                                </div>
                                <div className="shrink-0 flex flex-col items-start md:items-end gap-2">
                                    {isExpired ? (
                                        <span className="text-sm font-bold text-gray-400 dark:text-slate-500 font-mono">CLOSED</span>
                                    ) : isOpen ? (
                                        attemptsLeft === 0 ? (
                                            <div className="flex items-center gap-2 text-gray-500 dark:text-slate-400 font-bold text-sm border border-gray-200 dark:border-white/10 bg-gray-50 dark:bg-white/5 px-4 py-2.5 rounded-xl cursor-not-allowed">
                                                <CheckCircle className="w-4 h-4" /> Max Attempts Reached
                                            </div>
                                        ) : (
                                            <>
                                                <Link href={`/student/tests/${assignment.test?.id}/take`} className="inline-flex items-center gap-2 bg-gradient-to-br from-indigo-600 to-violet-600 dark:from-brand dark:to-brand-violet hover:opacity-90 text-white px-6 py-3 rounded-xl font-black text-sm transition shadow-lg shadow-indigo-900/20 dark:shadow-none">
                                                    <PlayCircle className="w-4 h-4" /> {summary.attemptsUsed > 0 ? 'Attempt again' : 'Start Mock Exam'}
                                                </Link>
                                                <span className="text-[11px] font-bold text-slate-400 dark:text-slate-500">{attemptsLeft} of {maxAttempts} attempt{maxAttempts === 1 ? '' : 's'} left</span>
                                            </>
                                        )
                                    ) : (
                                        <div className="flex items-center gap-2 text-amber-600 dark:text-accent-warm font-bold text-sm border border-amber-200 dark:border-accent-warm/30 bg-amber-50 dark:bg-accent-warm/10 px-4 py-2.5 rounded-xl">
                                            <Lock className="w-4 h-4" /> Scheduled
                                        </div>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
