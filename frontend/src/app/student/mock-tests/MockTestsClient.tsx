'use client';

import React from 'react';
import Link from 'next/link';
import { ClipboardList, Clock, Calendar, PlayCircle, CheckCircle, Lock, Trophy } from 'lucide-react';

interface MockTestsClientProps {
    assignments: any[];
}

export default function MockTestsClient({ assignments }: MockTestsClientProps) {
    return (
        <div className="p-6 md:p-10 max-w-5xl mx-auto dark:bg-background min-h-screen">
            <div className="mb-8">
                <div className="flex items-center gap-2 mb-2">
                    <Trophy className="w-6 h-6 text-indigo-600 dark:text-brand" />
                    <h1 className="font-display text-2xl font-black text-slate-900 dark:text-white">Mock Exams</h1>
                </div>
                <p className="text-slate-500 dark:text-slate-400 font-medium text-sm">Exam-style, timed, full-lockdown practice tests to simulate real conditions.</p>
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
                        return (
                            <div key={assignment.id} className="border border-gray-200 dark:border-white/10 bg-white dark:bg-surface rounded-2xl p-6 flex flex-col md:flex-row items-start md:items-center justify-between gap-4 hover:shadow-md transition">
                                <div>
                                    <div className="flex items-center gap-2 mb-2">
                                        <span className="text-[10px] font-black uppercase tracking-widest px-2.5 py-1 rounded-lg bg-indigo-100 dark:bg-brand/10 text-indigo-700 dark:text-brand">Mock Exam</span>
                                        {isExpired && <span className="text-[10px] font-black uppercase tracking-widest px-2.5 py-1 rounded-lg bg-gray-100 dark:bg-white/5 text-gray-500 dark:text-slate-400">Expired</span>}
                                    </div>
                                    <h3 className="text-lg font-black text-gray-900 dark:text-white">{assignment.test?.title}</h3>
                                    {assignment.instructions && <p className="text-sm text-gray-600 dark:text-slate-400 mt-1">{assignment.instructions}</p>}
                                    <div className="flex items-center gap-4 text-xs text-gray-500 dark:text-slate-400 font-medium mt-1">
                                        <span className="flex items-center gap-1"><Clock className="w-3.5 h-3.5" />{assignment.test?.duration} mins</span>
                                        <span>{assignment.test?.totalMarks} marks</span>
                                        {opens && <span className="flex items-center gap-1"><Calendar className="w-3.5 h-3.5" />Opens: {opens.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</span>}
                                        {closes && <span className="flex items-center gap-1"><Calendar className="w-3.5 h-3.5" />Due: {closes.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</span>}
                                    </div>
                                </div>
                                <div className="shrink-0">
                                    {isExpired ? (
                                        <span className="text-sm font-bold text-gray-400 dark:text-slate-500 font-mono">CLOSED</span>
                                    ) : isOpen ? (
                                        (assignment.test?.attempts?.length || 0) >= (assignment.maxAttempts || 1) ? (
                                            <div className="flex items-center gap-2 text-gray-500 dark:text-slate-400 font-bold text-sm border border-gray-200 dark:border-white/10 bg-gray-50 dark:bg-white/5 px-4 py-2.5 rounded-xl cursor-not-allowed">
                                                <CheckCircle className="w-4 h-4" /> Max Attempts Reached
                                            </div>
                                        ) : (
                                            <Link href={`/student/tests/${assignment.test?.id}/take`} className="inline-flex items-center gap-2 bg-gradient-to-br from-indigo-600 to-violet-600 dark:from-brand dark:to-brand-violet hover:opacity-90 text-white px-6 py-3 rounded-xl font-black text-sm transition shadow-lg shadow-indigo-900/20 dark:shadow-none">
                                                <PlayCircle className="w-4 h-4" /> Start Mock Exam
                                            </Link>
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
