'use client';

import React, { useState, useEffect } from 'react';
import { 
    Zap, 
    Crown, 
    Sparkles, 
    Target, 
    ArrowRight, 
    MessageCircle, 
    Upload, 
    Loader2, 
    CheckCircle2,
    BookOpen,
    HelpCircle
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'react-hot-toast';
import { useRouter } from 'next/navigation';

export default function PracticeArenaPage() {
    const router = useRouter();
    const [user, setUser] = useState<any>(null);
    const [isLoading, setIsLoading] = useState(true);
    
    // Quiz Config
    const [config, setConfig] = useState({
        topic: '',
        subtopic: '',
        type: 'SINGLE_CHOICE',
        count: 5,
        difficulty: 'MEDIUM'
    });
    
    const [isGenerating, setIsGenerating] = useState(false);
    const [quizQuestions, setQuizQuestions] = useState<any[]>([]);
    const [isQuizActive, setIsQuizActive] = useState(false);

    useEffect(() => {
        fetchUserStatus();
    }, []);

    const fetchUserStatus = async () => {
        try {
            const res = await fetch('/api/user/status'); // Assuming this exists or returns session user
            const data = await res.json();
            if (data.user) setUser(data.user);
        } catch (err) {
            console.error("Failed to fetch user status");
        } finally {
            setIsLoading(false);
        }
    };

    const handleStartPractice = async () => {
        if (!config.topic) return toast.error("Please enter a topic");
        setIsGenerating(true);
        
        try {
            const res = await fetch('/api/student/practice/generate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(config)
            });
            const data = await res.json();
            
            if (data.success) {
                setQuizQuestions(data.questions);
                setIsQuizActive(true);
                toast.success(`Loaded ${data.questions.length} questions!`);
            } else {
                toast.error(data.error || "Generation failed");
            }
        } catch (err) {
            toast.error("Network error");
        } finally {
            setIsGenerating(false);
        }
    };

    if (isLoading) return (
        <div className="flex flex-col items-center justify-center min-h-screen gap-4">
            <Loader2 className="w-10 h-10 text-indigo-600 animate-spin" />
            <p className="text-slate-400 font-bold">Entering Arena...</p>
        </div>
    );

    return (
        <div className="min-h-screen bg-slate-50 p-8 space-y-12">
            {/* Header & Status */}
            <div className="max-w-7xl mx-auto flex items-end justify-between gap-8">
                <div>
                    <h1 className="text-6xl font-black text-slate-900 tracking-tighter">Practice Arena</h1>
                    <p className="text-slate-400 font-bold mt-2 uppercase tracking-widest text-xs">AI-Powered Mathematics Training</p>
                </div>
                
                <div className="flex items-center gap-4">
                    {user?.subscription === 'PREMIUM' ? (
                        <div className="bg-gradient-to-r from-amber-400 to-orange-500 text-white px-6 py-4 rounded-3xl shadow-xl flex items-center gap-2">
                            <Crown className="w-5 h-5" />
                            <span className="font-black tracking-tight">👑 Premium Unlimited</span>
                        </div>
                    ) : (
                        <div className="bg-white border-2 border-indigo-100 px-6 py-4 rounded-3xl shadow-xl shadow-indigo-100 flex items-center gap-4">
                            <div className="flex items-center gap-2">
                                <Zap className="w-5 h-5 text-indigo-600 fill-indigo-600" />
                                <span className="font-black text-slate-900">⚡ {user?.aiTokens || 0} Tokens</span>
                            </div>
                            <button className="text-indigo-600 font-black text-xs uppercase tracking-widest hover:underline">Get More</button>
                        </div>
                    )}
                </div>
            </div>

            <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-3 gap-12">
                {/* Left Column: Form & Recommendations */}
                <div className="lg:col-span-2 space-y-10">
                    {/* Remedial Path */}
                    <section className="bg-white p-10 rounded-[3rem] shadow-xl shadow-slate-200/50 border border-slate-100 relative overflow-hidden">
                        <div className="absolute top-0 right-0 p-8 opacity-5">
                            <Target className="w-32 h-32" />
                        </div>
                        <h2 className="text-2xl font-black text-slate-900 mb-6 flex items-center gap-3">
                            <Sparkles className="w-6 h-6 text-indigo-600" />
                            Recommended for You
                        </h2>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {['Integration by Parts', 'Probability - Bayes Theorem'].map((topic) => (
                                <button 
                                    key={topic}
                                    onClick={() => setConfig({...config, topic})}
                                    className="p-6 bg-slate-50 hover:bg-indigo-50 border border-slate-100 hover:border-indigo-200 rounded-[2rem] text-left group transition-all"
                                >
                                    <span className="text-[10px] font-black text-indigo-400 uppercase tracking-widest block mb-1">Needs Work</span>
                                    <div className="flex items-center justify-between">
                                        <h3 className="font-black text-slate-900">{topic}</h3>
                                        <ArrowRight className="w-4 h-4 text-slate-300 group-hover:text-indigo-600 transition-all" />
                                    </div>
                                </button>
                            ))}
                        </div>
                    </section>

                    {/* Generator Form */}
                    {!isQuizActive && (
                        <section className="bg-white p-10 rounded-[3.5rem] shadow-2xl shadow-indigo-100/50 border-2 border-indigo-50 space-y-10">
                            <h2 className="text-3xl font-black text-slate-900 tracking-tight">Mass Quiz Generator</h2>
                            
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                                <div className="space-y-4">
                                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest ml-4">Core Topic</label>
                                    <input 
                                        type="text" 
                                        placeholder="e.g. Calculus"
                                        value={config.topic}
                                        onChange={e => setConfig({...config, topic: e.target.value})}
                                        className="w-full bg-slate-50 border-2 border-slate-50 rounded-3xl p-6 font-bold text-slate-900 focus:outline-none focus:border-indigo-400 focus:bg-white transition-all"
                                    />
                                </div>
                                <div className="space-y-4">
                                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest ml-4">Question Type</label>
                                    <select 
                                        value={config.type}
                                        onChange={e => setConfig({...config, type: e.target.value})}
                                        className="w-full bg-slate-50 border-2 border-slate-50 rounded-3xl p-6 font-bold text-slate-900 focus:outline-none focus:border-indigo-400 focus:bg-white appearance-none transition-all"
                                    >
                                        <option value="SINGLE_CHOICE">Single Choice (MCQ)</option>
                                        <option value="MULTIPLE_CHOICE">Multiple Choice</option>
                                        <option value="SUBJECTIVE">Subjective/Long Answer</option>
                                        <option value="SHORT_ANSWER">Short Answer</option>
                                    </select>
                                </div>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                                <div className="space-y-4">
                                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest ml-4">How Many? (1-20)</label>
                                    <div className="flex items-center gap-6 bg-slate-50 p-4 rounded-3xl">
                                        <button onClick={() => setConfig({...config, count: Math.max(1, config.count - 1)})} className="w-12 h-12 bg-white rounded-2xl font-black text-xl hover:bg-indigo-50">-</button>
                                        <span className="text-3xl font-black w-10 text-center">{config.count}</span>
                                        <button onClick={() => setConfig({...config, count: Math.min(20, config.count + 1)})} className="w-12 h-12 bg-white rounded-2xl font-black text-xl hover:bg-indigo-50">+</button>
                                    </div>
                                </div>
                                <div className="space-y-4">
                                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest ml-4">Difficulty Level</label>
                                    <div className="flex gap-2">
                                        {['EASY', 'MEDIUM', 'HARD'].map(d => (
                                            <button 
                                                key={d}
                                                onClick={() => setConfig({...config, difficulty: d})}
                                                className={`flex-1 py-4 rounded-2xl text-[10px] font-black transition-all ${config.difficulty === d ? 'bg-slate-900 text-white shadow-xl' : 'bg-slate-50 text-slate-400 hover:bg-slate-100'}`}
                                            >
                                                {d}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            </div>

                            <button 
                                onClick={handleStartPractice}
                                disabled={isGenerating}
                                className="w-full bg-indigo-600 hover:bg-slate-900 text-white font-black py-8 rounded-[2.5rem] shadow-2xl flex items-center justify-center gap-3 transition-all transform hover:scale-[1.01] active:scale-95 disabled:opacity-50"
                            >
                                {isGenerating ? (
                                    <><Loader2 className="w-6 h-6 animate-spin" /> Training AI Model...</>
                                ) : (
                                    <><Zap className="w-6 h-6 fill-white" /> Enter Arena & Generate</>
                                )}
                            </button>
                        </section>
                    )}
                </div>

                {/* Right Column: Premium & Insights */}
                <div className="space-y-10">
                    <section className="bg-gradient-to-br from-indigo-600 to-purple-700 p-10 rounded-[3.5rem] text-white shadow-2xl relative overflow-hidden group">
                        <div className="absolute top-0 right-0 p-8 opacity-20 group-hover:scale-110 transition-transform">
                            <Crown className="w-24 h-24" />
                        </div>
                        <h2 className="text-2xl font-black mb-4">👑 Premium: Worksheet Solver</h2>
                        <p className="text-indigo-100 font-bold text-sm mb-8">Upload a photo of your school worksheet or textbook page to generate a custom quiz instantly.</p>
                        
                        <div className="border-2 border-dashed border-white/30 rounded-3xl p-8 flex flex-col items-center text-center gap-4 bg-white/10 hover:bg-white/20 transition-all cursor-pointer">
                            <Upload className="w-10 h-10 text-indigo-200" />
                            <div>
                                <p className="font-black text-sm">Drop Worksheet Image</p>
                                <p className="text-[10px] font-black text-indigo-300 mt-1 uppercase tracking-widest">OCR Extraction Active</p>
                            </div>
                        </div>
                        
                        <button className="w-full mt-8 bg-white text-indigo-600 font-black py-4 rounded-2xl hover:bg-slate-100 transition-colors">
                            Upgrade to Premium
                        </button>
                    </section>

                    <section className="bg-white p-10 rounded-[3rem] shadow-xl border border-slate-100">
                        <h3 className="text-xl font-black text-slate-900 mb-6 flex items-center gap-2">
                            <BookOpen className="w-5 h-5 text-indigo-600" />
                            Arena Insights
                        </h3>
                        <div className="space-y-6">
                            <div className="flex items-center justify-between">
                                <span className="text-xs font-black text-slate-400 uppercase">Correctness Rate</span>
                                <span className="font-black text-slate-900">78%</span>
                            </div>
                            <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                                <div className="bg-emerald-500 h-full" style={{ width: '78%' }}></div>
                            </div>
                            
                            <div className="flex items-center justify-between">
                                <span className="text-xs font-black text-slate-400 uppercase">Total Questions</span>
                                <span className="font-black text-slate-900">1,240</span>
                            </div>
                        </div>
                    </section>
                </div>
            </div>

            {/* Quiz View (Simplified Overlay) */}
            <AnimatePresence>
                {isQuizActive && (
                    <motion.div 
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        className="fixed inset-0 bg-slate-950 z-[100] p-12 overflow-y-auto"
                    >
                        <div className="max-w-4xl mx-auto space-y-12">
                            <div className="flex items-center justify-between text-white">
                                <button onClick={() => setIsQuizActive(false)} className="text-slate-400 hover:text-white font-black text-sm uppercase tracking-widest flex items-center gap-2">
                                    Exit Arena
                                </button>
                                <div className="flex items-center gap-4 bg-white/10 px-6 py-3 rounded-2xl">
                                    <Zap className="w-4 h-4 text-indigo-400 fill-indigo-400" />
                                    <span className="font-black">Active Session: {config.topic}</span>
                                </div>
                            </div>

                            <div className="space-y-16">
                                {quizQuestions.map((q, idx) => (
                                    <div key={q.id} className="bg-white p-16 rounded-[4rem] shadow-2xl space-y-10">
                                        <div className="flex items-center gap-4">
                                            <span className="w-12 h-12 bg-slate-900 text-white rounded-2xl flex items-center justify-center font-black text-xl">
                                                {idx + 1}
                                            </span>
                                            <span className="text-xs font-black text-slate-400 uppercase tracking-widest">{q.difficulty}</span>
                                        </div>
                                        
                                        <h3 className="text-3xl font-black text-slate-900 leading-tight">
                                            {q.content}
                                        </h3>

                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                            {(q.options as string[])?.map((opt, oIdx) => (
                                                <button key={oIdx} className="p-8 bg-slate-50 border-2 border-slate-50 rounded-[2.5rem] text-left font-bold text-slate-700 hover:border-indigo-600 hover:bg-white transition-all">
                                                    {opt}
                                                </button>
                                            ))}
                                        </div>

                                        <div className="pt-10 border-t-2 border-slate-100 flex items-center justify-between">
                                            <div className="flex items-center gap-6">
                                                <button className="flex items-center gap-2 text-emerald-600 font-black text-sm uppercase tracking-widest hover:bg-emerald-50 px-6 py-3 rounded-2xl transition">
                                                    <CheckCircle2 className="w-4 h-4" />
                                                    Show Solution
                                                </button>
                                                <button 
                                                    onClick={() => router.push(`/student/doubts?questionId=${q.id}`)}
                                                    className="flex items-center gap-2 text-indigo-600 font-black text-sm uppercase tracking-widest hover:bg-indigo-50 px-6 py-3 rounded-2xl transition"
                                                >
                                                    <MessageCircle className="w-4 h-4" />
                                                    Ask Doubt Buddy
                                                </button>
                                            </div>
                                            <div className="text-slate-300">
                                                <HelpCircle className="w-6 h-6" />
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}
