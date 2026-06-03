'use client';

import React, { useState, useEffect } from 'react';
import { 
    Users, 
    BarChart3, 
    Activity, 
    Flame, 
    CalendarCheck, 
    Target, 
    Award, 
    TrendingUp,
    ShieldAlert,
    Clock
} from 'lucide-react';
import { motion } from 'framer-motion';

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

    if (loading) return <div className="flex justify-center items-center h-screen"><Activity className="w-8 h-8 text-indigo-500 animate-pulse" /></div>;

    return (
        <div className="min-h-screen bg-slate-50 p-8 pb-32">
            <div className="max-w-6xl mx-auto space-y-8">
                
                {/* Header */}
                <div className="bg-slate-950 p-10 rounded-[3rem] text-white shadow-2xl relative overflow-hidden">
                    <div className="absolute -right-16 -top-16 opacity-5">
                        <Users className="w-64 h-64" />
                    </div>
                    
                    <div className="relative z-10">
                        <span className="text-[10px] font-black text-emerald-400 uppercase tracking-[0.3em] block mb-2">Guardian Portal</span>
                        <h1 className="text-4xl font-black tracking-tight mb-2">Welcome, Guardian</h1>
                        <p className="text-slate-400 font-bold max-w-xl">
                            Monitoring progress for <span className="text-white">{stats.studentName}</span>.
                        </p>
                    </div>
                </div>

                {/* Top Stats Grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                    <motion.div initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.1 }} className="bg-white p-8 rounded-[2.5rem] border-2 border-slate-100 shadow-sm">
                        <div className="w-12 h-12 bg-emerald-50 rounded-2xl flex items-center justify-center mb-4">
                            <CalendarCheck className="w-6 h-6 text-emerald-600" />
                        </div>
                        <h3 className="text-4xl font-black text-slate-900 mb-1">{stats.attendancePercent}%</h3>
                        <p className="text-xs font-black text-slate-400 uppercase tracking-widest">Attendance</p>
                    </motion.div>

                    <motion.div initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.2 }} className="bg-white p-8 rounded-[2.5rem] border-2 border-slate-100 shadow-sm">
                        <div className="w-12 h-12 bg-orange-50 rounded-2xl flex items-center justify-center mb-4">
                            <Flame className="w-6 h-6 text-orange-600" />
                        </div>
                        <h3 className="text-4xl font-black text-slate-900 mb-1">{stats.currentStreak}</h3>
                        <p className="text-xs font-black text-slate-400 uppercase tracking-widest">Day Streak</p>
                    </motion.div>

                    <motion.div initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.3 }} className="bg-white p-8 rounded-[2.5rem] border-2 border-slate-100 shadow-sm relative overflow-hidden group">
                        <div className="w-12 h-12 bg-indigo-50 rounded-2xl flex items-center justify-center mb-4 relative z-10">
                            <Activity className="w-6 h-6 text-indigo-600" />
                        </div>
                        <h3 className="text-4xl font-black text-slate-900 mb-1 relative z-10">{stats.aiTokensUsed}</h3>
                        <p className="text-xs font-black text-slate-400 uppercase tracking-widest relative z-10">AI Doubts Asked</p>
                        <div className="absolute right-0 bottom-0 p-4 opacity-5 group-hover:opacity-10 transition-opacity">
                            <Activity className="w-32 h-32" />
                        </div>
                    </motion.div>

                    <motion.div initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.4 }} className="bg-gradient-to-br from-amber-400 to-yellow-500 p-8 rounded-[2.5rem] shadow-xl shadow-yellow-200 text-white">
                        <div className="w-12 h-12 bg-white/20 rounded-2xl flex items-center justify-center mb-4 backdrop-blur-sm">
                            <Award className="w-6 h-6" />
                        </div>
                        <h3 className="text-4xl font-black mb-1">Top {stats.globalRank}%</h3>
                        <p className="text-xs font-black text-yellow-900 uppercase tracking-widest">Batch Percentile</p>
                    </motion.div>
                </div>

                <div className="grid lg:grid-cols-3 gap-8">
                    {/* Performance Analytics */}
                    <div className="lg:col-span-2 bg-white p-10 rounded-[3rem] shadow-sm border border-slate-100">
                        <div className="flex items-center justify-between mb-8">
                            <h2 className="text-2xl font-black text-slate-900 flex items-center gap-3">
                                <TrendingUp className="w-6 h-6 text-indigo-600" />
                                Recent Test Deliverables
                            </h2>
                        </div>
                        
                        <div className="space-y-4">
                            {stats.recentScores.map((score, i) => (
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
