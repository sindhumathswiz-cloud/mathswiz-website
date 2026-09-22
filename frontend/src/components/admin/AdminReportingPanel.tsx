'use client';

import React, { useEffect, useState } from 'react';
import { BookOpen, Users, ShieldCheck, Activity, Loader2 } from 'lucide-react';

type CurriculumCoverage = {
    books: { bookId: string; bookTitle: string; className: string; subject: string; exerciseCount: number; discrepantCount: number; totalExpected: number; totalExtracted: number; totalMatched: number; totalUnresolved: number }[];
    platform: { exerciseCount: number; discrepantCount: number; totalExpected: number; totalExtracted: number; totalMatched: number; totalUnresolved: number };
};

type ClassPerformance = {
    classPerformance: { batchId: string; batchName: string; className: string | null; teacherName: string; studentCount: number; avgMastery: number; atRiskStudentCount: number }[];
};

type ContentQuality = {
    stats: {
        total: number;
        byVerificationStatus: Record<string, number>;
        flaggedPercent: number;
        riskByBook: Record<string, { blockedCount: number; avgScore: number }>;
        riskPoolSize: number;
        riskPoolCapped: boolean;
    };
};

type TeacherActivity = {
    teacherActivity: { teacherId: string; teacherName: string; totalActions: number; actionCounts: Record<string, number> }[];
    windowDays: number;
};

function SectionCard({ icon: Icon, title, children }: { icon: any; title: string; children: React.ReactNode }) {
    return (
        <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm">
            <h3 className="text-sm font-black text-gray-900 uppercase tracking-wide mb-4 flex items-center gap-2">
                <Icon className="w-4 h-4 text-indigo-600" /> {title}
            </h3>
            {children}
        </div>
    );
}

export function AdminReportingPanel() {
    const [curriculum, setCurriculum] = useState<CurriculumCoverage | null>(null);
    const [classPerformance, setClassPerformance] = useState<ClassPerformance | null>(null);
    const [contentQuality, setContentQuality] = useState<ContentQuality | null>(null);
    const [teacherActivity, setTeacherActivity] = useState<TeacherActivity | null>(null);
    const [loading, setLoading] = useState(true);

    // Fetched lazily on mount -- this whole panel only mounts once the admin
    // opens the Reports & Export tab, so this already satisfies "on tab-open,
    // not blocking the SSR dashboard page" without extra visibility tracking.
    useEffect(() => {
        Promise.all([
            fetch('/api/admin/reports/curriculum-coverage').then((r) => r.json()).then(setCurriculum).catch(() => {}),
            fetch('/api/admin/reports/class-performance').then((r) => r.json()).then(setClassPerformance).catch(() => {}),
            fetch('/api/admin/questions/stats').then((r) => r.json()).then(setContentQuality).catch(() => {}),
            fetch('/api/admin/reports/teacher-activity').then((r) => r.json()).then(setTeacherActivity).catch(() => {}),
        ]).finally(() => setLoading(false));
    }, []);

    if (loading) {
        return (
            <div className="flex items-center justify-center py-16">
                <Loader2 className="w-6 h-6 animate-spin text-indigo-600" />
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <div>
                <h2 className="text-2xl font-black text-gray-900 tracking-tight">Platform Reporting</h2>
                <p className="text-gray-500 font-medium text-sm">Curriculum coverage, class performance, content quality, and teacher activity across the whole platform.</p>
            </div>

            <SectionCard icon={BookOpen} title="Curriculum Coverage">
                {!curriculum || curriculum.books.length === 0 ? (
                    <p className="text-sm text-gray-400">No confirmed book chapters reconciled yet.</p>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="text-left text-[10px] font-black text-gray-400 uppercase tracking-wide border-b border-gray-100">
                                    <th className="py-2 pr-4">Book</th>
                                    <th className="py-2 pr-4">Class</th>
                                    <th className="py-2 pr-4">Exercises</th>
                                    <th className="py-2 pr-4">Extracted</th>
                                    <th className="py-2 pr-4">Unresolved</th>
                                    <th className="py-2">Discrepant</th>
                                </tr>
                            </thead>
                            <tbody>
                                {curriculum.books.map((b) => (
                                    <tr key={b.bookId} className="border-b border-gray-50">
                                        <td className="py-2 pr-4 font-bold text-gray-900">{b.bookTitle}</td>
                                        <td className="py-2 pr-4 text-gray-500">{b.className}</td>
                                        <td className="py-2 pr-4">{b.exerciseCount}</td>
                                        <td className="py-2 pr-4">{b.totalExtracted}</td>
                                        <td className="py-2 pr-4">{b.totalUnresolved}</td>
                                        <td className="py-2">{b.discrepantCount > 0 ? <span className="text-rose-600 font-bold">{b.discrepantCount}</span> : <span className="text-emerald-600">0</span>}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                        <p className="text-xs text-gray-400 mt-3">Platform total: {curriculum.platform.totalExtracted} extracted, {curriculum.platform.totalUnresolved} unresolved across {curriculum.platform.exerciseCount} exercises.</p>
                    </div>
                )}
            </SectionCard>

            <SectionCard icon={Users} title="Class Performance">
                {!classPerformance || classPerformance.classPerformance.length === 0 ? (
                    <p className="text-sm text-gray-400">No approved enrollments with mastery data yet.</p>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="text-left text-[10px] font-black text-gray-400 uppercase tracking-wide border-b border-gray-100">
                                    <th className="py-2 pr-4">Batch</th>
                                    <th className="py-2 pr-4">Teacher</th>
                                    <th className="py-2 pr-4">Students</th>
                                    <th className="py-2 pr-4">Avg Mastery</th>
                                    <th className="py-2">At Risk</th>
                                </tr>
                            </thead>
                            <tbody>
                                {classPerformance.classPerformance.map((b) => (
                                    <tr key={b.batchId} className="border-b border-gray-50">
                                        <td className="py-2 pr-4 font-bold text-gray-900">{b.batchName}</td>
                                        <td className="py-2 pr-4 text-gray-500">{b.teacherName}</td>
                                        <td className="py-2 pr-4">{b.studentCount}</td>
                                        <td className="py-2 pr-4">{b.avgMastery}%</td>
                                        <td className="py-2">{b.atRiskStudentCount > 0 ? <span className="text-rose-600 font-bold">{b.atRiskStudentCount}</span> : <span className="text-emerald-600">0</span>}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </SectionCard>

            <SectionCard icon={ShieldCheck} title="Content Quality">
                {!contentQuality ? (
                    <p className="text-sm text-gray-400">Unavailable.</p>
                ) : (
                    <div className="space-y-4">
                        <div className="grid grid-cols-3 gap-4">
                            <div className="bg-gray-50 rounded-xl p-4">
                                <p className="text-[10px] font-black text-gray-400 uppercase">Flagged</p>
                                <p className="text-xl font-black text-gray-900">{contentQuality.stats.flaggedPercent}%</p>
                            </div>
                            <div className="bg-gray-50 rounded-xl p-4">
                                <p className="text-[10px] font-black text-gray-400 uppercase">Open Pool Scored</p>
                                <p className="text-xl font-black text-gray-900">{contentQuality.stats.riskPoolSize}{contentQuality.stats.riskPoolCapped ? '+' : ''}</p>
                            </div>
                            <div className="bg-gray-50 rounded-xl p-4">
                                <p className="text-[10px] font-black text-gray-400 uppercase">Total Questions</p>
                                <p className="text-xl font-black text-gray-900">{contentQuality.stats.total}</p>
                            </div>
                        </div>
                        {Object.keys(contentQuality.stats.riskByBook).length > 0 && (
                            <div className="overflow-x-auto">
                                <table className="w-full text-sm">
                                    <thead>
                                        <tr className="text-left text-[10px] font-black text-gray-400 uppercase tracking-wide border-b border-gray-100">
                                            <th className="py-2 pr-4">Book</th>
                                            <th className="py-2 pr-4">Blocked</th>
                                            <th className="py-2">Avg Score</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {Object.entries(contentQuality.stats.riskByBook).map(([book, r]) => (
                                            <tr key={book} className="border-b border-gray-50">
                                                <td className="py-2 pr-4 font-bold text-gray-900">{book}</td>
                                                <td className="py-2 pr-4">{r.blockedCount > 0 ? <span className="text-rose-600 font-bold">{r.blockedCount}</span> : '0'}</td>
                                                <td className="py-2">{r.avgScore}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>
                )}
            </SectionCard>

            <SectionCard icon={Activity} title={`Teacher Activity (last ${teacherActivity?.windowDays ?? 30} days)`}>
                {!teacherActivity || teacherActivity.teacherActivity.length === 0 ? (
                    <p className="text-sm text-gray-400">No audit-logged teacher activity in this window.</p>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="text-left text-[10px] font-black text-gray-400 uppercase tracking-wide border-b border-gray-100">
                                    <th className="py-2 pr-4">Teacher</th>
                                    <th className="py-2">Total Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {teacherActivity.teacherActivity.slice(0, 10).map((t) => (
                                    <tr key={t.teacherId} className="border-b border-gray-50">
                                        <td className="py-2 pr-4 font-bold text-gray-900">{t.teacherName}</td>
                                        <td className="py-2">{t.totalActions}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </SectionCard>
        </div>
    );
}
