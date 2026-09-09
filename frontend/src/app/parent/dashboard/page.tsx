'use client';

import React, { useState, useEffect } from 'react';
import { 
    Activity, 
    Flame, 
    CalendarCheck, 
    Target, 
    Award, 
    TrendingUp,
    ShieldAlert,
    Clock
} from 'lucide-react';
import { TodayDashboard } from '@/components/dashboard/TodayDashboard';
import { DashboardState } from '@/components/dashboard/DashboardState';

export default function ParentDashboard() {
    const [loading, setLoading] = useState(true);
    const [stats, setStats] = useState({
        studentName: "Student",
        attendancePercent: 0,
        aiTokensUsed: 0,
        currentStreak: 0,
        globalRank: 0,
        recentScores: [] as any[]
    });

    useEffect(() => {
        const fetchDashboard = async () => {
            try {
                const res = await fetch('/api/parent/dashboard');
                const data = await res.json();
                if (data.success) {
                    setStats(data.stats);
                }
            } catch (e) {
                console.error("Failed to load dashboard data", e);
            } finally {
                setLoading(false);
            }
        };
        fetchDashboard();
    }, []);

    if (loading) return (
        <main className="min-h-screen bg-slate-50 p-6 sm:p-8">
            <div className="mx-auto max-w-3xl pt-24">
                <DashboardState loading title="Preparing the parent dashboard" description="Loading the latest attendance and assessment information." />
            </div>
        </main>
    );

    return (
        <div className="min-h-screen bg-slate-50 p-8 pb-32">
            <div className="max-w-6xl mx-auto space-y-8">
                <TodayDashboard
                    role="Parent"
                    title={`${stats.studentName}'s learning today`}
                    description="A clear view of attendance, recent progress, and anything that may need your support."
                    metrics={[
                        { label: 'Attendance', value: `${stats.attendancePercent}%`, hint: 'recorded attendance', icon: CalendarCheck, tone: 'emerald' },
                        { label: 'Learning streak', value: stats.currentStreak, hint: 'consecutive days', icon: Flame, tone: 'amber' },
                        { label: 'Questions asked', value: stats.aiTokensUsed, hint: 'AI learning conversations', icon: Activity, tone: 'indigo' },
                        { label: 'Batch percentile', value: `Top ${stats.globalRank}%`, hint: 'current cohort position', icon: Award, tone: 'sky' },
                    ]}
                    priorities={[
                        { title: stats.attendancePercent < 75 ? 'Attendance needs attention' : 'Attendance is on track', detail: stats.attendancePercent < 75 ? 'Review missed classes and available recordings together.' : 'Keep supporting the current learning routine.', tone: stats.attendancePercent < 75 ? 'attention' : 'success' },
                        { title: stats.recentScores.length ? 'Review the latest test' : 'No recent test results', detail: stats.recentScores.length ? 'Discuss what went well and choose one area to improve.' : 'Results will appear here after the next completed assessment.', tone: 'neutral' },
                    ]}
                    actions={[
                        { label: 'Review recent results', icon: TrendingUp, onClick: () => document.getElementById('recent-results')?.scrollIntoView({ behavior: 'smooth' }) },
                    ]}
                />
                
                <div className="grid lg:grid-cols-3 gap-8">
                    {/* Performance Analytics */}
                    <div id="recent-results" className="lg:col-span-2 bg-white p-10 rounded-[3rem] shadow-sm border border-slate-100 scroll-mt-8">
                        <div className="flex items-center justify-between mb-8">
                            <h2 className="text-2xl font-black text-slate-900 flex items-center gap-3">
                                <TrendingUp className="w-6 h-6 text-indigo-600" />
                                Recent Test Deliverables
                            </h2>
                        </div>
                        
                        <div className="space-y-4">
                            {stats.recentScores.length === 0 ? (
                                <DashboardState title="No recent results" description="Completed assessment results will appear here automatically." />
                            ) : stats.recentScores.map((score, i) => (
                                <div key={i} className="flex items-center justify-between p-6 bg-slate-50 rounded-3xl border border-slate-100 hover:border-indigo-200 hover:shadow-lg hover:shadow-indigo-50 transition-all group">
                                    <div className="flex items-center gap-6">
                                        <div className="w-16 h-16 rounded-2xl bg-white shadow-sm flex items-center justify-center font-black text-xl text-indigo-600 group-hover:bg-indigo-600 group-hover:text-white transition-colors">
                                            {score.score}%
                                        </div>
                                        <div>
                                            <h4 className="font-black text-slate-900 text-lg">{score.test}</h4>
                                            <div className="flex items-center gap-3 mt-1">
                                                <span className="text-xs font-bold text-slate-400 flex items-center gap-1">
                                                    <Clock className="w-3 h-3" /> {score.date}
                                                </span>
                                                <span className="text-xs font-bold text-emerald-500 bg-emerald-50 px-2 py-1 rounded-md">
                                                    +{score.score - score.avg}% above Batch Avg
                                                </span>
                                            </div>
                                        </div>
                                    </div>
                                    <button className="text-sm font-bold text-indigo-600 bg-indigo-50 px-4 py-2 rounded-xl group-hover:bg-indigo-100 transition-colors">
                                        View Details
                                    </button>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Escalate / Notifications */}
                    <div className="space-y-6">
                        <div className="bg-rose-50 p-8 rounded-[3rem] border border-rose-100 relative overflow-hidden">
                            <div className="absolute right-0 top-0 opacity-10 p-6"><ShieldAlert className="w-24 h-24 text-rose-500" /></div>
                            <h3 className="text-xl font-black text-rose-900 mb-2 relative z-10">Low Attendance Warning</h3>
                            <p className="text-sm font-semibold text-rose-700/80 mb-6 relative z-10">{stats.studentName} missed some classes recently. Please ensure they catch up on MS Teams recordings.</p>
                            <button className="w-full bg-rose-600 hover:bg-rose-700 text-white font-black py-4 rounded-2xl shadow-lg transition-colors relative z-10">
                                Contact Teacher
                            </button>
                        </div>
                        
                        <div className="bg-indigo-600 p-8 rounded-[3rem] text-white shadow-xl shadow-indigo-200 text-center">
                            <Target className="w-12 h-12 text-indigo-200 mx-auto mb-4" />
                            <h3 className="text-xl font-black mb-2">Target JEE Mains</h3>
                            <p className="text-sm font-bold text-indigo-200 mb-6">Current trajectory predicts a 94th percentile.</p>
                            <div className="w-full bg-indigo-950/50 rounded-full h-3 mb-2">
                                <div className="bg-emerald-400 h-3 rounded-full" style={{ width: '75%' }}></div>
                            </div>
                            <span className="text-[10px] font-black uppercase tracking-widest text-indigo-200">On Track</span>
                        </div>
                    </div>
                </div>
                
            </div>
        </div>
    );
}
