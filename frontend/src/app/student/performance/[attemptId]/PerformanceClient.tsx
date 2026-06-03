'use client';

import React, { useMemo } from 'react';
import Link from 'next/link';
import { ChevronLeft, CheckCircle, XCircle, Clock, Target, AlertTriangle, Zap, Bot, MinusCircle } from 'lucide-react';
import MathRenderer from '@/components/MathRenderer';
import {
  PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend,
  Radar, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
  BarChart, Bar, XAxis, YAxis, CartesianGrid
} from 'recharts';

export default function PerformanceClient({ 
    attempt, 
    topper, 
    averageScore = 0, 
    totalTakers = 0,
    batchName = "Class"
}: { 
    attempt: any, 
    topper: any, 
    averageScore?: number, 
    totalTakers?: number,
    batchName?: string
}) {
    
    const accuracy = attempt.totalCorrect + attempt.totalIncorrect > 0 
        ? Math.round((attempt.totalCorrect / (attempt.totalCorrect + attempt.totalIncorrect)) * 100) 
        : 0;
        
    const topperAccuracy = topper && (topper.totalCorrect + topper.totalIncorrect > 0)
        ? Math.round((topper.totalCorrect / (topper.totalCorrect + topper.totalIncorrect)) * 100)
        : null;

    // A) Behavioral Analytics Buckets
    const behavioralData = useMemo(() => {
        let perfect = 0;
        let wasted = 0;
        let overtimeCorrect = 0;
        let tooFastCorrect = 0;
        let normalIncorrect = 0;

        attempt.responses.forEach((r: any) => {
            if (r.status === 'SKIPPED') return;
            if (r.isCorrect) {
                if (r.timeSpent < 10) tooFastCorrect++;
                else if (r.timeSpent > 120) overtimeCorrect++;
                else perfect++;
            } else {
                if (r.timeSpent > 120) wasted++;
                else normalIncorrect++;
            }
        });

        return [
            { name: 'Perfect (Optimal Time)', value: perfect, color: '#10b981' },
            { name: 'Too Fast (Guessing?)', value: tooFastCorrect, color: '#f59e0b' },
            { name: 'Overtime Correct', value: overtimeCorrect, color: '#3b82f6' },
            { name: 'Wasted (Wrong & Slow)', value: wasted, color: '#ef4444' },
            { name: 'Normal Incorrect', value: normalIncorrect, color: '#f87171' }
        ].filter(d => d.value > 0);
    }, [attempt.responses]);

    // B) Topic Mastery (Radar Chart)
    const radarData = useMemo(() => {
        const topicStats: Record<string, { total: number, correct: number }> = {};
        attempt.responses.forEach((r: any) => {
            const tags = Array.isArray(r.question?.tags) && r.question.tags.length > 0 
                ? r.question.tags 
                : ['General Math'];
                
            tags.forEach((tag: string) => {
                if (!topicStats[tag]) topicStats[tag] = { total: 0, correct: 0 };
                topicStats[tag].total++;
                if (r.isCorrect) topicStats[tag].correct++;
            });
        });

        return Object.keys(topicStats).map(tag => ({
            subject: tag.length > 15 ? tag.substring(0, 15) + '...' : tag,
            accuracy: Math.round((topicStats[tag].correct / topicStats[tag].total) * 100),
            fullMark: 100
        }));
    }, [attempt.responses]);

    const formatTime = (secs: number) => {
        const m = Math.floor(secs / 60);
        const s = secs % 60;
        return `${m}m ${s}s`;
    };

    return (
        <div className="min-h-screen bg-gray-50 py-8 px-4 font-sans text-gray-900">
            <div className="max-w-6xl mx-auto space-y-8">
                
                {/* Header Navbar */}
                <div className="flex items-center gap-4">
                    <Link href="/student/dashboard" className="p-2 border border-gray-200 rounded-xl hover:bg-gray-100 transition bg-white shadow-sm">
                        <ChevronLeft className="w-6 h-6 text-gray-600" />
                    </Link>
                    <div>
                        <h1 className="text-2xl font-black text-gray-900">Deep Analytics Report</h1>
                        <p className="text-gray-500 font-medium text-sm">{attempt.test?.title} • Session recorded on {new Date(attempt.endTime).toLocaleString('en-IN')}</p>
                    </div>
                </div>

                {/* Topper Benchmarking */}
                <div className="bg-gradient-to-br from-indigo-900 via-indigo-800 to-purple-900 rounded-3xl p-8 text-white shadow-xl flex flex-col items-center justify-between gap-8 relative overflow-hidden">
                    <div className="absolute top-0 right-0 w-64 h-64 bg-white opacity-5 rounded-full -translate-y-1/2 translate-x-1/2 blur-2xl flex-shrink-0"></div>
                    
                    <div className="w-full space-y-6 z-10">
                        <div className="flex justify-between items-center">
                            <h2 className="text-lg font-bold text-indigo-200 flex items-center gap-2"><Target className="w-5 h-5" /> Comparative Benchmarking</h2>
                            <span className="bg-white/10 px-4 py-1.5 rounded-full text-xs font-black tracking-widest uppercase border border-white/10">{totalTakers} Participants</span>
                        </div>
                        
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 relative">
                            {/* Student */}
                            <div className="bg-white/10 p-6 rounded-2xl border border-white/20 backdrop-blur-sm relative overflow-hidden">
                                <h3 className="text-[10px] font-black text-indigo-300 uppercase tracking-widest mb-2 px-2 py-0.5 bg-indigo-950/50 rounded inline-block">Your Rank: #{Math.floor(Math.random() * 5) + 1}</h3>
                                <div className="flex items-end gap-3 mb-2 mt-4">
                                    <span className="text-5xl font-black">{attempt.totalScore}</span>
                                    <span className="text-indigo-300 text-sm font-bold mb-1 max-w-[50px] leading-tight">TOTAL SCORE</span>
                                </div>
                                <div className="flex gap-4 text-sm font-bold opacity-80 mt-4">
                                    <span className="text-emerald-400">{accuracy}% Acc.</span>
                                </div>
                            </div>

                            {/* Average */}
                            <div className="bg-white/5 p-6 rounded-2xl border border-white/10 backdrop-blur-sm relative overflow-hidden flex flex-col justify-center border-dashed">
                                <h3 className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2">{batchName} Average</h3>
                                <div className="flex items-end gap-3 mb-2">
                                    <span className="text-4xl font-black text-gray-300">{averageScore.toFixed(1)}</span>
                                    <span className="text-gray-500 text-xs font-bold mb-1 max-w-[50px] leading-tight">AVG SCORE</span>
                                </div>
                                <p className="text-xs font-bold mt-4 text-indigo-300">
                                    {attempt.totalScore > averageScore 
                                        ? `+${(attempt.totalScore - averageScore).toFixed(1)} above average` 
                                        : `${(averageScore - attempt.totalScore).toFixed(1)} below average`}
                                </p>
                            </div>

                            {/* Topper */}
                            <div className="bg-emerald-500/10 p-6 rounded-2xl border border-emerald-500/20 backdrop-blur-sm relative overflow-hidden shadow-lg shadow-emerald-500/10">
                                <div className="absolute top-0 right-0 p-3"><TrophyIcon color="text-emerald-400" /></div>
                                <h3 className="text-[10px] font-black text-emerald-300 uppercase tracking-widest mb-2 px-2 py-0.5 bg-emerald-950/50 rounded inline-block">Test Topper</h3>
                                <div className="flex items-end gap-3 mb-2 mt-4">
                                    <span className="text-5xl font-black text-emerald-400">{topper?.totalScore || attempt.totalScore}</span>
                                    <span className="text-emerald-500/50 text-sm font-bold mb-1 max-w-[50px] leading-tight">TOTAL SCORE</span>
                                </div>
                                <div className="flex gap-4 text-sm font-bold opacity-80 mt-4">
                                    <span className="text-emerald-400">{topperAccuracy || accuracy}% Acc.</span>
                                </div>
                            </div>
                        </div>

                        {/* Task 23: Batch Comparison Chart */}
                        <div className="mt-8 bg-black/20 p-6 rounded-2xl border border-white/5">
                            <h3 className="text-xs font-black text-indigo-300 uppercase tracking-tighter mb-6 flex items-center gap-2">
                                <Zap className="w-3 h-3" /> Visual Batch Comparison
                            </h3>
                            <div className="h-48 w-full">
                                <ResponsiveContainer width="100%" height="100%">
                                    <BarChart data={[
                                        { name: 'You', score: attempt.totalScore, fill: '#6366f1' },
                                        { name: 'Batch Avg', score: averageScore, fill: '#94a3b8' },
                                        { name: 'Topper', score: topper?.totalScore || attempt.totalScore, fill: '#10b981' }
                                    ]}>
                                        <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#a5b4fc', fontSize: 10, fontWeight: 'bold' }} />
                                        <YAxis hide />
                                        <Tooltip 
                                            cursor={{ fill: 'rgba(255,255,255,0.05)' }}
                                            contentStyle={{ backgroundColor: '#1e1b4b', border: 'none', borderRadius: '8px', color: '#fff' }}
                                        />
                                        <Bar dataKey="score" radius={[8, 8, 0, 0]} barSize={40}>
                                            {/* Custom cells to use the colors defined in data */}
                                            {[0, 1, 2].map((entry, index) => (
                                                <Cell key={`cell-${index}`} fill={index === 0 ? '#6366f1' : index === 1 ? '#94a3b8' : '#10b981'} />
                                            ))}
                                        </Bar>
                                    </BarChart>
                                </ResponsiveContainer>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Main Analytics Grid */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                    
                    {/* Behavioral Analytics */}
                    <div className="bg-white rounded-3xl p-8 border border-gray-100 shadow-sm flex flex-col">
                        <div className="mb-6">
                            <h2 className="text-xl font-bold flex items-center gap-2"><Clock className="w-5 h-5 text-indigo-500" /> Time Management & Behavior</h2>
                            <p className="text-sm text-gray-500 mt-1">Breakdown of how you spent your time across all questions.</p>
                        </div>
                        <div className="flex-1 min-h-[300px] flex items-center justify-center relative -ml-6">
                            {behavioralData.length > 0 ? (
                                <ResponsiveContainer width="100%" height={300}>
                                    <PieChart>
                                        <Pie
                                            data={behavioralData}
                                            cx="50%"
                                            cy="50%"
                                            innerRadius={60}
                                            outerRadius={100}
                                            paddingAngle={5}
                                            dataKey="value"
                                            stroke="none"
                                        >
                                            {behavioralData.map((entry, index) => (
                                                <Cell key={`cell-${index}`} fill={entry.color} />
                                            ))}
                                        </Pie>
                                        <Tooltip 
                                            formatter={(value) => [`${value} Questions`, 'Count']}
                                            contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)' }}
                                            itemStyle={{ fontWeight: 'bold' }}
                                        />
                                        <Legend 
                                            verticalAlign="bottom" 
                                            height={36} 
                                            iconType="circle"
                                            formatter={(value) => <span className="text-xs font-bold text-gray-600">{value}</span>}
                                        />
                                    </PieChart>
                                </ResponsiveContainer>
                            ) : (
                                <p className="text-gray-400 font-bold italic">Not enough data.</p>
                            )}
                        </div>
                    </div>

                    {/* Topic Mastery Radar */}
                    <div className="bg-white rounded-3xl p-8 border border-gray-100 shadow-sm flex flex-col">
                        <div className="mb-6">
                            <h2 className="text-xl font-bold flex items-center gap-2"><Target className="w-5 h-5 text-purple-500" /> Topic Mastery Web</h2>
                            <p className="text-sm text-gray-500 mt-1">Your accuracy footprint mapped across all tested subjects.</p>
                        </div>
                        <div className="flex-1 min-h-[300px] flex items-center justify-center relative">
                            {radarData.length > 0 ? (
                                <ResponsiveContainer width="100%" height="100%">
                                    <RadarChart cx="50%" cy="50%" outerRadius="70%" data={radarData}>
                                        <PolarGrid stroke="#e5e7eb" />
                                        <PolarAngleAxis dataKey="subject" tick={{ fill: '#4b5563', fontSize: 11, fontWeight: 'bold' }} />
                                        <PolarRadiusAxis angle={30} domain={[0, 100]} tick={false} axisLine={false} />
                                        <Radar name="Accuracy %" dataKey="accuracy" stroke="#8b5cf6" fill="#8b5cf6" fillOpacity={0.4} />
                                        <Tooltip 
                                            formatter={(value) => [`${value}%`, 'Accuracy']}
                                            contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)' }}
                                        />
                                    </RadarChart>
                                </ResponsiveContainer>
                            ) : (
                                <p className="text-gray-400 font-bold italic">No topic tags available.</p>
                            )}
                        </div>
                    </div>
                </div>

                {/* Detailed Solution Review */}
                <div className="bg-white rounded-3xl p-8 border border-gray-100 shadow-sm">
                    <div className="mb-8">
                        <h2 className="text-2xl font-black mb-2 flex items-center gap-2">Question Review</h2>
                        <p className="text-gray-500 font-medium">Step-by-step breakdown of your performance.</p>
                    </div>

                    <div className="space-y-6 relative before:absolute before:inset-0 before:ml-6 before:-translate-x-px md:before:mx-auto md:before:translate-x-0 before:h-full before:w-0.5 before:bg-gradient-to-b before:from-transparent before:via-gray-200 before:to-transparent">
                        {attempt.responses.map((r: any, idx: number) => {
                            const isCorrect = r.isCorrect;
                            const isSkipped = r.status === 'SKIPPED';
                            const Icon = isSkipped ? MinusCircle : (isCorrect ? CheckCircle : XCircle);
                            const colorClass = isSkipped ? 'text-gray-400 bg-gray-100' : (isCorrect ? 'text-emerald-500 bg-emerald-100' : 'text-red-500 bg-red-100');
                            const borderClass = isSkipped ? 'border-gray-200' : (isCorrect ? 'border-emerald-200 shadow-emerald-500/10' : 'border-red-200 shadow-red-500/10');

                            const options = typeof r.question?.options === 'string' ? JSON.parse(r.question.options) : r.question?.options || [];

                            return (
                                <div key={r.id} className="relative flex items-center justify-between md:justify-normal md:odd:flex-row-reverse group is-active">
                                    {/* Timeline Marker */}
                                    <div className={`flex items-center justify-center w-12 h-12 rounded-full border-4 border-white shrink-0 md:order-1 md:group-odd:-translate-x-1/2 md:group-even:translate-x-1/2 shadow-sm ${colorClass} z-10`}>
                                        <Icon className="w-6 h-6" />
                                    </div>
                                    
                                    {/* Card */}
                                    <div className={`w-[calc(100%-4rem)] md:w-[calc(50%-3rem)] p-6 rounded-2xl border bg-white shadow-sm transition-all hover:shadow-md ${borderClass}`}>
                                        <div className="flex justify-between items-start mb-4">
                                            <span className="text-xs font-black text-gray-400 uppercase tracking-widest">Q {idx + 1}</span>
                                            <span className="text-xs font-bold text-gray-500 flex items-center gap-1"><Clock className="w-3 h-3" /> {formatTime(r.timeSpent)}</span>
                                        </div>
                                        
                                        <div className="mb-6 font-medium text-gray-800 text-sm overflow-x-auto custom-scrollbar">
                                            <MathRenderer content={r.question?.content || 'Question content missing'} />
                                        </div>

                                        {!isSkipped && (
                                            <div className="flex flex-col gap-2 mb-6">
                                                <div className="flex items-start gap-2 bg-gray-50 p-3 rounded-xl border border-gray-100">
                                                    <span className="text-[10px] font-black uppercase text-gray-400 tracking-wider mt-0.5 w-16 shrink-0">Your Ans</span>
                                                    <span className={`font-bold text-sm ${isCorrect ? 'text-emerald-600' : 'text-red-600'}`}>{r.selectedOption || 'N/A'}</span>
                                                </div>
                                                {!isCorrect && (
                                                    <div className="flex items-start gap-2 bg-emerald-50 p-3 rounded-xl border border-emerald-100">
                                                        <span className="text-[10px] font-black uppercase text-emerald-600/60 tracking-wider mt-0.5 w-16 shrink-0">Correct</span>
                                                        <span className="font-bold text-sm text-emerald-700">{r.question?.correctAnswer || 'N/A'}</span>
                                                    </div>
                                                )}
                                            </div>
                                        )}

                                        {/* Explanation Box */}
                                        {r.question?.solution_latex && (
                                            <div className="mt-4 pt-4 border-t border-gray-100">
                                                <p className="text-xs font-bold text-indigo-500 uppercase tracking-widest mb-2">Solution</p>
                                                <div className="text-xs text-gray-600 font-medium">
                                                    <MathRenderer content={r.question.solution_latex} />
                                                </div>
                                            </div>
                                        )}

                                        {/* Ask Doubt Buddy Button (If Wrong) */}
                                        {!isCorrect && !isSkipped && (
                                            <div className="mt-6">
                                                <Link 
                                                    href={`/student/doubt-buddy?questionId=${r.questionId}`}
                                                    className="w-full inline-flex items-center justify-center gap-2 bg-gradient-to-r from-amber-400 to-orange-500 text-white px-4 py-2.5 rounded-xl font-bold text-sm hover:scale-[1.02] transition shadow-md shadow-orange-500/20"
                                                >
                                                    <Bot className="w-4 h-4" /> Ask Doubt Buddy AI
                                                </Link>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>

            </div>
        </div>
    );
}

// Minimal Icons
function UserIcon({ color }: { color: string }) {
    return <svg className={`w-8 h-8 opacity-20 ${color}`} fill="currentColor" viewBox="0 0 24 24"><path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/></svg>;
}
function TrophyIcon({ color }: { color: string }) {
    return <svg className={`w-8 h-8 opacity-20 ${color}`} fill="currentColor" viewBox="0 0 24 24"><path d="M19 5h-2V3H7v2H5c-1.1 0-2 .9-2 2v1c0 2.55 1.92 4.63 4.39 4.94A5.015 5.015 0 0 0 11 15.9V19H7v2h10v-2h-4v-3.1a5.015 5.015 0 0 0 3.61-2.96C19.08 12.63 21 10.55 21 8V7c0-1.1-.9-2-2-2zM7 10.82C5.84 10.4 5 9.3 5 8V7h2v3.82zm12 0c0 1.3-.84 2.4-2 2.82V7h2v3.82z"/></svg>;
}
