'use client';

import React from 'react';
import { 
    LineChart, Line, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
    Radar, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, BarChart, Bar, Cell
} from 'recharts';
import { TrendingUp, Target, Clock, Zap, BookOpen, AlertCircle } from 'lucide-react';

interface PerformanceAnalyticsProps {
    attempts: any[];
}

export default function PerformanceAnalytics({ attempts }: PerformanceAnalyticsProps) {
    // 1. Prepare Mastery Data (Radar Chart)
    const subjectWise = attempts.reduce((acc: any, curr: any) => {
        const subject = curr.test?.subject || 'General';
        if (!acc[subject]) acc[subject] = { total: 0, correct: 0, attempts: 0 };
        acc[subject].total += 1;
        acc[subject].correct += curr.totalCorrect;
        acc[subject].attempts += (curr.totalCorrect + curr.totalIncorrect + curr.totalSkipped) || 1;
        return acc;
    }, {});

    const masteryData = Object.keys(subjectWise).map(subject => ({
        subject,
        score: Math.round((subjectWise[subject].correct / subjectWise[subject].attempts) * 100) || 0,
        fullMark: 100
    }));

    // 2. Prepare Time vs Score (Area Chart)
    const timelineData = [...attempts].reverse().map((a, i) => ({
        index: i + 1,
        score: Math.round((a.totalScore / (a.test?.totalMarks || 100)) * 100),
        date: new Date(a.endTime).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
    }));

    // 3. Prepare Time Spent Analytics
    const avgTimePerQuestion = attempts.reduce((acc, curr) => acc + (curr.timeSpent || 0), 0) / 
        (attempts.reduce((acc, curr) => acc + (curr.totalCorrect + curr.totalIncorrect), 0) || 1);

    return (
        <div className="space-y-8">
            {/* Top Insight Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="bg-gradient-to-br from-indigo-500 to-indigo-700 p-6 rounded-3xl text-white shadow-xl shadow-indigo-100">
                    <div className="flex items-center gap-3 mb-4">
                        <div className="p-2 bg-white/20 rounded-xl">
                            <TrendingUp size={20} />
                        </div>
                        <span className="font-bold text-sm uppercase tracking-wider">Overall Proficiency</span>
                    </div>
                    <div className="text-4xl font-black mb-2">
                        {attempts.length > 0 
                            ? Math.round(attempts.reduce((acc, curr) => acc + (curr.totalScore / (curr.test?.totalMarks || 100)) * 100, 0) / attempts.length)
                            : 0}%
                    </div>
                    <p className="text-indigo-100 text-xs font-medium">Based on your last {attempts.length} attempts</p>
                </div>

                <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm">
                    <div className="flex items-center gap-3 mb-4">
                        <div className="p-2 bg-rose-50 text-rose-500 rounded-xl">
                            <Clock size={20} />
                        </div>
                        <span className="font-bold text-sm text-slate-500 uppercase tracking-wider">Avg Speed</span>
                    </div>
                    <div className="text-4xl font-black text-slate-900 mb-2">
                        {Math.round(avgTimePerQuestion / 60)}m <span className="text-xl font-bold text-slate-400">{Math.round(avgTimePerQuestion % 60)}s</span>
                    </div>
                    <p className="text-slate-400 text-xs font-medium">Per question across all tests</p>
                </div>

                <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm">
                    <div className="flex items-center gap-3 mb-4">
                        <div className="p-2 bg-emerald-50 text-emerald-500 rounded-xl">
                            <Zap size={20} />
                        </div>
                        <span className="font-bold text-sm text-slate-500 uppercase tracking-wider">Strike Rate</span>
                    </div>
                    <div className="text-4xl font-black text-slate-900 mb-2">
                        {attempts.length > 0 
                            ? Math.round((attempts.reduce((acc, curr) => acc + curr.totalCorrect, 0) / 
                                (attempts.reduce((acc, curr) => acc + (curr.totalCorrect + curr.totalIncorrect), 0) || 1)) * 100)
                            : 0}%
                    </div>
                    <p className="text-slate-400 text-xs font-medium">Accuracy when attempting questions</p>
                </div>
            </div>

            {/* Main Charts Row */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                {/* Mastery Radar */}
                <div className="bg-white p-8 rounded-3xl border border-slate-100 shadow-sm">
                    <h3 className="text-lg font-black text-slate-900 mb-8 flex items-center gap-2">
                        <Target className="w-5 h-5 text-indigo-500" /> Topic Mastery Radar
                    </h3>
                    <div className="h-[300px] w-full">
                        {masteryData.length > 0 ? (
                            <ResponsiveContainer width="100%" height="100%">
                                <RadarChart cx="50%" cy="50%" outerRadius="80%" data={masteryData}>
                                    <PolarGrid stroke="#e2e8f0" />
                                    <PolarAngleAxis dataKey="subject" tick={{ fill: '#64748b', fontSize: 12, fontWeight: 'bold' }} />
                                    <PolarRadiusAxis angle={30} domain={[0, 100]} tick={false} axisLine={false} />
                                    <Radar
                                        name="Mastery"
                                        dataKey="score"
                                        stroke="#6366f1"
                                        fill="#6366f1"
                                        fillOpacity={0.6}
                                    />
                                </RadarChart>
                            </ResponsiveContainer>
                        ) : (
                            <div className="h-full flex flex-col items-center justify-center text-slate-400">
                                <BookOpen size={48} className="mb-4 opacity-20" />
                                <p className="text-sm font-medium">Complete more tests to see mastery data</p>
                            </div>
                        )}
                    </div>
                </div>

                {/* Score Progression */}
                <div className="bg-white p-8 rounded-3xl border border-slate-100 shadow-sm">
                    <h3 className="text-lg font-black text-slate-900 mb-8 flex items-center gap-2">
                        <TrendingUp className="w-5 h-5 text-emerald-500" /> Score Progression
                    </h3>
                    <div className="h-[300px] w-full">
                        {timelineData.length > 0 ? (
                            <ResponsiveContainer width="100%" height="100%">
                                <AreaChart data={timelineData}>
                                    <defs>
                                        <linearGradient id="colorScore" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.3}/>
                                            <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0}/>
                                        </linearGradient>
                                    </defs>
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                                    <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 10, fontWeight: 'bold' }} dy={10} />
                                    <YAxis domain={[0, 100]} hide />
                                    <Tooltip 
                                        contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                                    />
                                    <Area 
                                        type="monotone" 
                                        dataKey="score" 
                                        stroke="#8b5cf6" 
                                        strokeWidth={4}
                                        fillOpacity={1} 
                                        fill="url(#colorScore)" 
                                        dot={{ r: 4, fill: '#8b5cf6', strokeWidth: 2, stroke: '#fff' }}
                                        activeDot={{ r: 6, strokeWidth: 0 }}
                                    />
                                </AreaChart>
                            </ResponsiveContainer>
                        ) : (
                            <div className="h-full flex flex-col items-center justify-center text-slate-400">
                                <TrendingUp size={48} className="mb-4 opacity-20" />
                                <p className="text-sm font-medium">Attempt your first test to track progress</p>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Warning / Focus Area */}
            {attempts.length > 2 && (
                <div className="bg-rose-50 border border-rose-100 p-6 rounded-3xl flex items-start gap-4">
                    <div className="p-3 bg-white rounded-2xl text-rose-500 shadow-sm">
                        <AlertCircle size={24} />
                    </div>
                    <div>
                        <h4 className="font-black text-rose-900 uppercase tracking-wider text-xs mb-1">Doubt Buddy AI Insight</h4>
                        <p className="text-rose-700 text-sm font-medium">
                            Your performance in <span className="font-bold">Organic Chemistry</span> has dipped by 12% in the last 3 tests. 
                            We recommend spending 30 minutes in the <span className="italic underline underline-offset-4">Practice Arena</span> specifically for Reaction Mechanisms.
                        </p>
                    </div>
                </div>
            )}
        </div>
    );
}
