'use client';

import React, { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { 
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, 
    PieChart, Pie, Cell, LineChart, Line, AreaChart, Area 
} from 'recharts';
import {
    ChevronLeft,
    Target,
    Zap,
    Clock,
    AlertCircle,
    CheckCircle2,
    Trophy,
    TrendingUp,
    Timer,
    MousePointer2,
    Calendar,
    ArrowUpRight,
    Sparkles,
    BookX,
    PartyPopper
} from 'lucide-react';
import MathRenderer from '@/components/MathRenderer';
import QuestionTrustBadge from '@/components/QuestionTrustBadge';
import toast from 'react-hot-toast';

export default function PerformanceAnalytics() {
    const params = useParams();
    const router = useRouter();
    const attemptId = params.attemptId;
    const [data, setData] = useState<any>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetchData();
    }, [attemptId]);

    const fetchData = async () => {
        try {
            const res = await fetch(`/api/student/performance/${attemptId}`);
            if (!res.ok) throw new Error('Failed to fetch performance data');
            const json = await res.json();
            setData(json);
        } catch (err) {
            toast.error("Could not load performance report");
        } finally {
            setLoading(false);
        }
    };

    if (loading) return (
        <div className="h-screen flex items-center justify-center bg-slate-50">
            <div className="text-center animate-pulse">
                <div className="w-16 h-16 bg-indigo-600 rounded-2xl mx-auto mb-4 flex items-center justify-center shadow-xl shadow-indigo-100">
                    <TrendingUp className="w-8 h-8 text-white" />
                </div>
                <p className="text-slate-400 font-black uppercase tracking-widest text-xs">Generating Neural Insights</p>
            </div>
        </div>
    );

    if (!data) return <div>Error loading data.</div>;

    const { attempt, behavioral, rank, totalTakers, responseInsights, recommendedAction } = data;
    const insightByResponseId = new Map((responseInsights || []).map((ri: any) => [ri.responseId, ri]));

    const ERROR_TYPE_LABEL: Record<string, string> = {
        SKIPPED: 'Skipped',
        CARELESS: 'Careless',
        NEEDS_REVIEW: 'Needs Review',
        COMMON_MISTAKE: 'Common Mistake',
    };
    const CONFIDENCE_STYLE: Record<string, string> = {
        HIGH: 'bg-emerald-50 text-emerald-700 border-emerald-100',
        MEDIUM: 'bg-amber-50 text-amber-700 border-amber-100',
        LOW: 'bg-rose-50 text-rose-700 border-rose-100',
    };

    // Data for charts
    const behavioralData = [
        { name: 'Perfect', value: behavioral.perfect, color: '#10b981', detail: 'Correct & Efficient' },
        { name: 'Overtime', value: behavioral.overtime, color: '#6366f1', detail: 'Correct but Slow' },
        { name: 'Too Fast', value: behavioral.tooFast, color: '#f59e0b', detail: 'Guessed / Lucky' },
        { name: 'Wasted', value: behavioral.wasted, color: '#f43f5e', detail: 'Incorrect & Slow' },
    ].filter(d => d.value > 0);

    const timeSeriesData = attempt.responses.map((r: any, i: number) => ({
        index: i + 1,
        time: Math.round(r.timeSpent),
        status: r.isCorrect ? 'Correct' : 'Incorrect',
        median: behavioral.medianTime
    }));

    return (
        <div className="min-h-screen bg-[#F8FAFC] pb-20 font-sans">
            {/* Header */}
            <div className="bg-white border-b border-slate-200 sticky top-0 z-30">
                <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
                    <div className="flex items-center gap-6">
                        <button onClick={() => router.back()} className="w-10 h-10 border border-slate-200 rounded-xl flex items-center justify-center hover:bg-slate-50 transition-all text-slate-500">
                            <ChevronLeft className="w-5 h-5" />
                        </button>
                        <div>
                            <h1 className="text-xl font-black text-slate-900 tracking-tight">Post-Exam Intelligence</h1>
                            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-0.5">{attempt.test?.title || 'Practice Session'}</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-4">
                        <div className="text-right hidden sm:block">
                            <p className="text-xs font-black text-slate-900">Score Achieved</p>
                            <p className="text-2xl font-black text-indigo-600 leading-none mt-1" suppressHydrationWarning>{attempt.totalScore}</p>
                        </div>
                        <div className="w-12 h-12 bg-indigo-600 rounded-2xl flex items-center justify-center shadow-lg shadow-indigo-100">
                            <Trophy className="w-6 h-6 text-white" />
                        </div>
                    </div>
                </div>
            </div>

            <div className="max-w-7xl mx-auto px-6 mt-8 space-y-8">
                {/* Score Summary Grid */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
                    {[
                        { label: 'Total Questions', value: attempt.responses.length, icon: MousePointer2, color: 'text-slate-600', bg: 'bg-slate-100' },
                        { label: 'Accuracy', value: `${attempt.totalCorrect + attempt.totalIncorrect > 0 ? Math.round((attempt.totalCorrect / (attempt.totalCorrect + attempt.totalIncorrect)) * 100) : 0}%`, icon: Target, color: 'text-emerald-600', bg: 'bg-emerald-50' },
                        { label: 'Avg Time/Q', value: `${Math.round(behavioral.medianTime)}s`, icon: Clock, color: 'text-blue-600', bg: 'bg-blue-50' },
                        { label: 'Rank', value: rank ? `${rank}/${totalTakers}` : 'Not available', icon: Trophy, color: 'text-amber-600', bg: 'bg-amber-50' },
                    ].map((stat, i) => (
                        <div key={i} className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm flex items-center gap-4">
                            <div className={`p-4 ${stat.bg} ${stat.color} rounded-2xl`}>
                                <stat.icon className="w-6 h-6" />
                            </div>
                            <div>
                                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{stat.label}</p>
                                <p className="text-2xl font-black text-slate-900 tracking-tight">{stat.value}</p>
                            </div>
                        </div>
                    ))}
                </div>

                {/* Recommended Next Action */}
                {recommendedAction && recommendedAction.type !== 'KEEP_GOING' && (
                    <div className="bg-gradient-to-br from-indigo-600 to-purple-700 rounded-[40px] p-8 shadow-xl shadow-indigo-100 flex flex-col md:flex-row items-start md:items-center justify-between gap-6 text-white">
                        <div className="flex items-start gap-4">
                            <div className="w-12 h-12 bg-white/20 rounded-2xl flex items-center justify-center shrink-0">
                                {recommendedAction.type === 'REVIEW_MISTAKES' ? <BookX className="w-6 h-6" /> : <Sparkles className="w-6 h-6" />}
                            </div>
                            <div>
                                <p className="text-[10px] font-black uppercase tracking-widest text-indigo-100 mb-1">Recommended Next Action</p>
                                {recommendedAction.type === 'REVIEW_MISTAKES' ? (
                                    <h3 className="text-lg font-black">You have {recommendedAction.count} mistake{recommendedAction.count === 1 ? '' : 's'} due for review</h3>
                                ) : (
                                    <h3 className="text-lg font-black">Practice your weakest topic from this attempt: {recommendedAction.topic}</h3>
                                )}
                            </div>
                        </div>
                        <button
                            onClick={() => router.push(recommendedAction.type === 'REVIEW_MISTAKES' ? '/student/practice?mode=mistakes' : '/student/practice?mode=smart')}
                            className="bg-white text-indigo-700 font-black px-6 py-3 rounded-2xl hover:bg-indigo-50 transition shadow-lg text-sm uppercase tracking-widest shrink-0"
                        >
                            {recommendedAction.type === 'REVIEW_MISTAKES' ? 'Review Mistakes' : 'Start Smart Practice'}
                        </button>
                    </div>
                )}
                {recommendedAction && recommendedAction.type === 'KEEP_GOING' && (
                    <div className="bg-emerald-50 border border-emerald-100 rounded-[40px] p-6 flex items-center gap-4">
                        <div className="w-12 h-12 bg-white rounded-2xl flex items-center justify-center text-emerald-600 shadow-sm shrink-0">
                            <PartyPopper className="w-6 h-6" />
                        </div>
                        <div>
                            <p className="text-[10px] font-black uppercase tracking-widest text-emerald-500 mb-1">Recommended Next Action</p>
                            <h3 className="text-sm font-black text-emerald-900">Nothing urgent — keep up the momentum!</h3>
                        </div>
                    </div>
                )}

                {/* Behavioral & Time Analytics */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                    {/* Behavioral categorization (The "Embibe" Look) */}
                    <div className="lg:col-span-1 bg-white p-8 rounded-[40px] border border-slate-200 shadow-sm flex flex-col">
                        <div className="mb-8">
                            <div className="flex items-center gap-2 mb-2">
                                <Zap className="w-5 h-5 text-indigo-600" />
                                <h3 className="text-lg font-black text-slate-900 uppercase tracking-tighter">Behavioral Breakdown</h3>
                            </div>
                            <p className="text-xs font-medium text-slate-500">How your decisions impacted your final score.</p>
                        </div>

                        <div className="h-64 mb-8">
                            <ResponsiveContainer width="100%" height="100%">
                                <PieChart>
                                    <Pie data={behavioralData} cx="50%" cy="50%" innerRadius={60} outerRadius={80} paddingAngle={5} dataKey="value">
                                        {behavioralData.map((entry, index) => (
                                            <Cell key={`cell-${index}`} fill={entry.color} />
                                        ))}
                                    </Pie>
                                    <Tooltip contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }} />
                                </PieChart>
                            </ResponsiveContainer>
                        </div>

                        <div className="space-y-4">
                            {behavioralData.map((d, i) => (
                                <div key={i} className="flex items-center justify-between p-4 bg-slate-50 rounded-2xl border border-slate-100 group transition-all hover:border-indigo-200">
                                    <div className="flex items-center gap-3">
                                        <div className="w-3 h-3 rounded-full" style={{ backgroundColor: d.color }}></div>
                                        <div>
                                            <p className="text-xs font-black text-slate-900 uppercase">{d.name}</p>
                                            <p className="text-[10px] font-medium text-slate-400">{d.detail}</p>
                                        </div>
                                    </div>
                                    <span className="text-lg font-black text-slate-900">{d.value}</span>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Time Series Chart */}
                    <div className="lg:col-span-2 bg-white p-8 rounded-[40px] border border-slate-200 shadow-sm">
                        <div className="flex justify-between items-start mb-10">
                            <div>
                                <div className="flex items-center gap-2 mb-2">
                                    <Timer className="w-5 h-5 text-indigo-600" />
                                    <h3 className="text-lg font-black text-slate-900 uppercase tracking-tighter">Temporal Flow</h3>
                                </div>
                                <p className="text-xs font-medium text-slate-500">Timeline of exertion vs accuracy across the paper.</p>
                            </div>
                            <div className="flex items-center gap-4 text-[10px] font-black uppercase tracking-widest">
                                <div className="flex items-center gap-1.5"><div className="w-2.5 h-2.5 rounded-full bg-emerald-500"></div> Correct</div>
                                <div className="flex items-center gap-1.5"><div className="w-2.5 h-2.5 rounded-full bg-rose-500"></div> Incorrect</div>
                            </div>
                        </div>

                        <div className="h-[400px]">
                            <ResponsiveContainer width="100%" height="100%">
                                <AreaChart data={timeSeriesData}>
                                    <defs>
                                        <linearGradient id="colorTime" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="5%" stopColor="#6366f1" stopOpacity={0.1}/>
                                            <stop offset="95%" stopColor="#6366f1" stopOpacity={0}/>
                                        </linearGradient>
                                    </defs>
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                                    <XAxis dataKey="index" stroke="#94a3b8" fontSize={12} tickLine={false} axisLine={false} />
                                    <YAxis stroke="#94a3b8" fontSize={12} tickLine={false} axisLine={false} unit="s" />
                                    <Tooltip 
                                        cursor={{ stroke: '#e2e8f0', strokeWidth: 1 }}
                                        contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 20px 25px -5px rgb(0 0 0 / 0.1)' }}
                                    />
                                    <Line type="monotone" dataKey="median" stroke="#94a3b8" strokeDasharray="5 5" dot={false} strokeWidth={1} />
                                    <Area type="monotone" dataKey="time" stroke="#6366f1" strokeWidth={3} fillOpacity={1} fill="url(#colorTime)" dot={(props: any) => {
                                        const { cx, cy, payload } = props;
                                        const isCorrect = payload.status === 'Correct';
                                        return <circle cx={cx} cy={cy} r={5} fill={isCorrect ? '#10b981' : '#f43f5e'} stroke="white" strokeWidth={2} />;
                                    }} />
                                </AreaChart>
                            </ResponsiveContainer>
                        </div>
                    </div>
                </div>

                {/* Granular Response Audit */}
                <div className="bg-white rounded-[40px] border border-slate-200 shadow-sm overflow-hidden">
                    <div className="p-8 border-b border-slate-100 flex items-center justify-between">
                        <div>
                            <h3 className="text-lg font-black text-slate-900 uppercase tracking-tighter">Response Audit</h3>
                            <p className="text-xs font-medium text-slate-500">Step-by-step review of all attempted vectors.</p>
                        </div>
                        <div className="flex gap-2">
                             <button className="px-5 py-2.5 bg-indigo-50 text-indigo-700 rounded-2xl text-xs font-black uppercase tracking-widest hover:bg-indigo-100 transition shadow-sm">Filter: Incorrect</button>
                             <button className="px-5 py-2.5 bg-slate-900 text-white rounded-2xl text-xs font-black uppercase tracking-widest shadow-lg">Download PDF Analysis</button>
                        </div>
                    </div>

                    <div className="divide-y divide-slate-50">
                        {attempt.responses.map((r: any, i: number) => {
                            const insight = insightByResponseId.get(r.id) as { errorType: string | null; confidence: string | null } | undefined;
                            return (
                            <div key={i} className="p-8 hover:bg-slate-50/50 transition-colors">
                                <div className="flex flex-col lg:flex-row gap-8">
                                    <div className="w-16 h-16 rounded-2xl bg-slate-900 text-white flex items-center justify-center font-black text-xl shrink-0">
                                        {i + 1}
                                    </div>
                                    <div className="flex-1 space-y-6">
                                        {(insight?.errorType || insight?.confidence) && (
                                            <div className="flex flex-wrap items-center gap-2">
                                                {insight.errorType && (
                                                    <span className="text-[10px] font-black uppercase tracking-widest px-3 py-1.5 rounded-full bg-slate-100 text-slate-600 border border-slate-200">
                                                        {ERROR_TYPE_LABEL[insight.errorType] || insight.errorType}
                                                    </span>
                                                )}
                                                {insight.confidence && (
                                                    <span className={`text-[10px] font-black uppercase tracking-widest px-3 py-1.5 rounded-full border ${CONFIDENCE_STYLE[insight.confidence]}`}>
                                                        {insight.confidence} Confidence
                                                    </span>
                                                )}
                                            </div>
                                        )}
                                        <div className="prose prose-slate max-w-none">
                                            <MathRenderer content={r.question.content} />
                                        </div>

                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                            <div className={`p-4 rounded-2xl border ${r.isCorrect ? 'bg-emerald-50 border-emerald-100 text-emerald-900' : 'bg-rose-50 border-rose-100 text-rose-900'} flex items-center gap-3`}>
                                                {r.isCorrect ? <CheckCircle2 className="w-5 h-5" /> : <AlertCircle className="w-5 h-5" />}
                                                <div>
                                                    <p className="text-[10px] font-black uppercase opacity-60">Your Response</p>
                                                    <p className="text-sm font-bold">Option {r.selectedOption || 'Skipped'} {r.isCorrect ? '(Correct)' : '(Incorrect)'}</p>
                                                </div>
                                            </div>
                                            <div className="p-4 rounded-2xl border bg-slate-50 border-slate-100 text-slate-900 flex items-center gap-3">
                                                <Clock className="w-5 h-5 text-slate-400" />
                                                <div>
                                                    <p className="text-[10px] font-black uppercase opacity-60">Time Invested</p>
                                                    <p className="text-sm font-bold">{Math.round(r.timeSpent)} seconds</p>
                                                </div>
                                            </div>
                                        </div>

                                        {!r.isCorrect && (
                                            <div className="bg-indigo-50/50 border border-indigo-100 rounded-3xl p-6">
                                                <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                                                    <p className="text-xs font-black text-indigo-600 uppercase tracking-widest flex items-center gap-2">
                                                        <ArrowUpRight className="w-4 h-4" /> Conceptual Resolution
                                                    </p>
                                                    <QuestionTrustBadge status={r.question.status} verificationStatus={r.question.verificationStatus} />
                                                </div>
                                                <div className="text-sm font-medium text-slate-700">
                                                    <MathRenderer content={r.question.explanation || 'Solution not available.'} />
                                                </div>
                                            </div>
                                        )}
                                    </div>
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
