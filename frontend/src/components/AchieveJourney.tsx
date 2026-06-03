'use client';

import React from 'react';
import { Target, Flag, TrendingUp, Trophy, ArrowRight, Gauge, Briefcase, GraduationCap } from 'lucide-react';

interface AchieveJourneyProps {
    goal: { targetExam: string; targetScore: number } | null;
    attempts: any[];
    progress: any[];
}

export default function AchieveJourney({ goal, attempts, progress }: AchieveJourneyProps) {
    if (!goal) return (
        <div className="bg-white rounded-3xl p-12 text-center border-2 border-dashed border-amber-200">
            <Target className="w-16 h-16 text-amber-200 mx-auto mb-4" />
            <h3 className="text-xl font-black text-slate-800 mb-2">Target Goal Not Set</h3>
            <p className="text-slate-500 max-w-sm mx-auto mb-6">Set your dream exam and target score in the Performance tab to start your achievement journey.</p>
        </div>
    );

    const avgScore = attempts.length > 0 
        ? Math.round(attempts.reduce((acc, curr) => acc + curr.totalScore, 0) / attempts.length)
        : 0;
    
    const gap = Math.max(0, goal.targetScore - avgScore);
    const progressPct = Math.min(100, Math.round((avgScore / goal.targetScore) * 100));

    // Calculate Achievements based on progress
    const topTopic = progress.length > 0 ? progress[0] : null;

    return (
        <div className="space-y-8 animate-in fade-in duration-700">
            {/* Main Road Map Header */}
            <div className="bg-gradient-to-br from-indigo-900 via-indigo-800 to-indigo-900 rounded-[3rem] p-10 text-white relative overflow-hidden shadow-2xl">
                <div className="absolute top-0 right-0 p-10 opacity-10">
                    <Flag size={200} />
                </div>
                
                <div className="relative z-10 flex flex-col md:flex-row items-center justify-between gap-12">
                    <div className="flex-1">
                        <div className="flex items-center gap-3 mb-6">
                            <span className="px-4 py-1.5 bg-indigo-500/20 border border-indigo-400/30 rounded-full text-xs font-black uppercase tracking-widest text-indigo-200">The Ultimate Goal</span>
                        </div>
                        <h2 className="text-5xl font-black mb-4 tracking-tighter">Cracking {goal.targetExam}</h2>
                        <div className="flex items-center gap-6">
                            <div>
                                <p className="text-indigo-300 text-xs font-bold uppercase tracking-widest mb-1">Target Score</p>
                                <p className="text-3xl font-black">{goal.targetScore}</p>
                            </div>
                            <div className="w-[1px] h-10 bg-indigo-500/30" />
                            <div>
                                <p className="text-indigo-300 text-xs font-bold uppercase tracking-widest mb-1">Current Status</p>
                                <p className="text-3xl font-black text-emerald-400">{avgScore}</p>
                            </div>
                        </div>
                    </div>

                    <div className="shrink-0 flex flex-col items-center">
                        <div className="relative w-48 h-48 flex items-center justify-center">
                            <svg className="w-full h-full -rotate-90">
                                <circle cx="96" cy="96" r="80" fill="transparent" stroke="rgba(255,255,255,0.05)" strokeWidth="12" />
                                <circle 
                                    cx="96" cy="96" r="80" fill="transparent" 
                                    stroke="url(#emeraldGradient)" strokeWidth="12" 
                                    strokeDasharray={2 * Math.PI * 80}
                                    strokeDashoffset={(2 * Math.PI * 80) * (1 - progressPct/100)}
                                    strokeLinecap="round"
                                />
                                <defs>
                                    <linearGradient id="emeraldGradient" x1="0%" y1="0%" x2="100%" y2="0%">
                                        <stop offset="0%" stopColor="#10b981" />
                                        <stop offset="100%" stopColor="#34d399" />
                                    </linearGradient>
                                </defs>
                            </svg>
                            <div className="absolute flex flex-col items-center justify-center">
                                <span className="text-4xl font-black">{progressPct}%</span>
                                <span className="text-[10px] font-bold uppercase tracking-widest text-indigo-300">Achieved</span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Topic Mastery Grid */}
            <div className="space-y-4">
                <h3 className="text-lg font-black text-slate-800 uppercase tracking-tighter flex items-center gap-2">
                    <Trophy className="text-amber-500 w-5 h-5" /> Area-wise Mastery
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {progress.length === 0 ? (
                        <div className="col-span-full py-10 px-6 bg-slate-50 border border-dashed border-slate-200 rounded-3xl text-center">
                            <p className="text-slate-400 text-sm italic">Analyze your practice sessions to see mastery here.</p>
                        </div>
                    ) : (
                        progress.slice(0, 4).map((topic, i) => (
                            <div key={i} className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm transition-all hover:shadow-md hover:border-indigo-200 group">
                                <div className="flex justify-between items-start mb-4">
                                    <div className="flex items-center gap-3">
                                        <div className="w-10 h-10 bg-indigo-50 text-indigo-600 rounded-xl flex items-center justify-center group-hover:bg-indigo-600 group-hover:text-white transition-colors">
                                            <Target size={20} />
                                        </div>
                                        <div>
                                            <p className="font-black text-slate-900 text-sm uppercase tracking-tight">{topic.topic}</p>
                                            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Mastery Status</p>
                                        </div>
                                    </div>
                                    <div className="flex flex-col items-end">
                                        <span className="text-lg font-black text-indigo-600">{topic.masteryScore}%</span>
                                        {topic.currentStreak > 1 && (
                                            <span className="text-[9px] font-black text-orange-600 bg-orange-50 px-1.5 py-0.5 rounded flex items-center gap-0.5">
                                                <TrendingUp size={10} /> {topic.currentStreak} Streak
                                            </span>
                                        )}
                                    </div>
                                </div>
                                <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden">
                                    <div 
                                        className="h-full bg-indigo-600 rounded-full transition-all duration-1000" 
                                        style={{ width: `${topic.masteryScore}%` }}
                                    />
                                </div>
                            </div>
                        ))
                    )}
                </div>
            </div>

            {/* Gap Analysis Blocks */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <div className="bg-white rounded-3xl p-8 border border-slate-100 shadow-sm flex items-start gap-6">
                    <div className="w-16 h-16 bg-rose-50 text-rose-500 rounded-2xl flex items-center justify-center shrink-0">
                        <ArrowRight size={32} />
                    </div>
                    <div>
                        <h4 className="text-sm font-black text-slate-400 uppercase tracking-widest mb-1">Marks to Close</h4>
                        <p className="text-4xl font-black text-slate-900 mb-2">{gap}</p>
                        <p className="text-slate-500 text-sm font-medium">This is the critical gap. Bridging this will put you in the top 1% percentile.</p>
                    </div>
                </div>

                <div className="bg-white rounded-3xl p-8 border border-slate-100 shadow-sm flex items-start gap-6">
                    <div className="w-16 h-16 bg-indigo-50 text-indigo-600 rounded-2xl flex items-center justify-center shrink-0">
                        <Gauge size={32} />
                    </div>
                    <div>
                        <h4 className="text-sm font-black text-slate-400 uppercase tracking-widest mb-1">Consistency Level</h4>
                        <p className="text-4xl font-black text-slate-900 mb-2">{attempts.length > 5 ? 'Elite' : attempts.length > 0 ? 'Rising' : 'Day 1'}</p>
                        <p className="text-slate-500 text-sm font-medium">Engagement with daily practice is the leading indicator of exam success.</p>
                    </div>
                </div>
            </div>

            {/* Career/Exam Roadmap */}
            <div className="bg-slate-900 rounded-[3rem] p-10 text-white shadow-2xl">
                <h3 className="text-xl font-black mb-10 flex items-center gap-2">
                    <TrendingUp className="text-indigo-400" /> Milestone Forecast
                </h3>

                <div className="relative space-y-12 before:absolute before:inset-y-0 before:left-6 before:w-[2px] before:bg-slate-800">
                    {[
                        { label: 'Foundation Mastery', status: 'COMPLETED', icon: Briefcase, color: 'text-emerald-400' },
                        { label: 'Speed Calibration', status: progressPct > 40 ? 'COMPLETED' : 'IN_PROGRESS', icon: Gauge, color: progressPct > 40 ? 'text-emerald-400' : 'text-indigo-400' },
                        { label: 'Critical Gap Closure', status: progressPct > 70 ? 'COMPLETED' : 'UPCOMING', icon: Target, color: progressPct > 70 ? 'text-emerald-400' : 'text-slate-500' },
                        { label: `${goal.targetExam} Excellence`, status: 'ELITE', icon: GraduationCap, color: 'text-slate-600' }
                    ].map((m, i) => (
                        <div key={i} className="relative pl-16">
                            <div className={`absolute left-0 w-12 h-12 rounded-xl bg-slate-800 flex items-center justify-center ${m.color} z-10 border-4 border-slate-900`}>
                                <m.icon size={20} />
                            </div>
                            <div>
                                <h4 className="font-black text-lg mb-1">{m.label}</h4>
                                <p className={`text-[10px] font-black uppercase tracking-widest ${m.color}`}>{m.status}</p>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}
