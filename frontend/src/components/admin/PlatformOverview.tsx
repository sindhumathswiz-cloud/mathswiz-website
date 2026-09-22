'use client';

import React from 'react';
import { TrendingUp, AlertCircle } from 'lucide-react';
import { LineChart as RechartsLineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer } from 'recharts';

interface PlatformOverviewProps {
    totalPending: number;
    doubtsCount?: number;
    engagementData?: Array<{ week: string; score: number }>;
    onActionNow: () => void;
}

export function PlatformOverview({ totalPending, doubtsCount = 0, engagementData = [], onActionNow }: PlatformOverviewProps) {
    return (
        <div className="animate-in fade-in duration-300">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                <div className="border border-gray-200 rounded-2xl p-6 shadow-sm dark:border-white/10">
                    <h3 className="font-display text-lg font-bold text-gray-900 mb-6 flex items-center gap-2 dark:text-white">
                        <TrendingUp className="w-5 h-5 text-indigo-500 dark:text-brand" /> Engagement & Test Scores
                    </h3>
                    <div className="h-64">
                        {engagementData.length === 0 ? (
                            <div className="h-full flex items-center justify-center text-sm text-gray-500 text-center px-6 dark:text-slate-400">
                                Engagement scores will appear after students complete assigned tests.
                            </div>
                        ) : (
                        <ResponsiveContainer width="100%" height="100%" minHeight={250} minWidth={0}>
                            <RechartsLineChart data={engagementData}>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5E7EB" />
                                <XAxis dataKey="week" axisLine={false} tickLine={false} tick={{ fill: '#6B7280' }} />
                                <YAxis axisLine={false} tickLine={false} tick={{ fill: '#6B7280' }} />
                                <RechartsTooltip contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} />
                                <Line type="monotone" dataKey="score" stroke="#4f46e5" strokeWidth={3} dot={{ r: 4, strokeWidth: 2 }} activeDot={{ r: 6 }} />
                            </RechartsLineChart>
                        </ResponsiveContainer>
                        )}
                    </div>
                </div>
                <div className="border border-amber-200 bg-amber-50/50 rounded-2xl p-6 shadow-sm flex flex-col justify-center items-center text-center dark:bg-amber-500/10 dark:border-amber-500/20">
                    <AlertCircle className="w-12 h-12 text-amber-500 mb-4" />
                    <h3 className="font-display text-xl font-bold text-gray-900 mb-2 dark:text-white">Attention Required</h3>
                    <p className="text-gray-600 mb-6 dark:text-slate-400">
                        You currently have {totalPending} pending items requiring your approval and {doubtsCount} unread doubts from students.
                    </p>
                    <button 
                        onClick={onActionNow} 
                        className="bg-gradient-to-br from-indigo-600 to-violet-600 dark:from-brand dark:to-brand-violet text-white font-medium px-6 py-2.5 rounded-lg hover:opacity-90 transition"
                    >
                        Action Now
                    </button>
                </div>
            </div>
        </div>
    );
}
