'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { 
    ChevronRight, 
    Zap, 
    BrainCircuit, 
    Trophy, 
    Flame, 
    History, 
    Target,
    Loader2,
    CheckCircle2,
    XCircle,
    ArrowRight,
    MessageSquareQuote,
    HelpCircle
} from 'lucide-react';
import MathRenderer from '@/components/MathRenderer';
import QuestionTags from '@/components/QuestionTags';
import toast from 'react-hot-toast';
import { motion, AnimatePresence } from 'framer-motion';

export default function PracticeArena() {
    const router = useRouter();
    const [question, setQuestion] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [selectedOption, setSelectedOption] = useState<string | null>(null);
    const [isSubmitted, setIsSubmitted] = useState(false);
    const [hint, setHint] = useState<string | null>(null);
    const [isHintLoading, setIsHintLoading] = useState(false);
    const [streak, setStreak] = useState(0);
    const [startTime, setStartTime] = useState(Date.now());
    const [stats, setStats] = useState({ correct: 0, total: 0 });

    useEffect(() => {
        fetchNextQuestion();
    }, []);

    const fetchNextQuestion = async () => {
        setLoading(true);
        setSelectedOption(null);
        setIsSubmitted(false);
        setHint(null);
        setStartTime(Date.now());
        try {
            const res = await fetch('/api/student/practice/next');
            if (!res.ok) throw new Error('No questions available');
            const data = await res.json();
            setQuestion(data.question);
        } catch (err) {
            toast.error("Could not fetch question");
        } finally {
            setLoading(false);
        }
    };

    const handleOptionSelect = (opt: string) => {
        if (isSubmitted) return;
        setSelectedOption(opt);
    };

    const handleSubmit = async () => {
        if (!selectedOption || !question) return;
        
        const isCorrect = selectedOption === question.correctAnswer;
        const timeSpent = Math.floor((Date.now() - startTime) / 1000);
        
        setIsSubmitted(true);
        if (isCorrect) {
            setStreak(s => s + 1);
            setStats(prev => ({ ...prev, correct: prev.correct + 1, total: prev.total + 1 }));
            toast.success("Brilliant! Correct Answer.");
        } else {
            setStreak(0);
            setStats(prev => ({ ...prev, total: prev.total + 1 }));
            toast.error("Not quite. Check the solution below.");
        }

        // Save progress in background
        try {
            await fetch('/api/student/practice/submit', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    questionId: question.id,
                    selectedOption,
                    timeSpent,
                    isCorrect
                })
            });
        } catch (err) {
            console.error("Failed to save progress");
        }
    };

    const getHint = async () => {
        if (!question || isHintLoading) return;
        setIsHintLoading(true);
        try {
            const res = await fetch('/api/student/practice/hint', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ questionContent: question.content })
            });
            const data = await res.json();
            setHint(data.hint);
        } catch (err) {
            toast.error("Doubt Buddy is busy.");
        } finally {
            setIsHintLoading(false);
        }
    };

    if (loading) return (
        <div className="h-screen flex items-center justify-center bg-slate-50">
            <Loader2 className="w-12 h-12 animate-spin text-indigo-600" />
        </div>
    );

    if (!question) return (
        <div className="h-screen flex items-center justify-center">
            <div className="text-center">
                <HelpCircle className="w-16 h-16 text-slate-300 mx-auto mb-4" />
                <h2 className="text-xl font-bold text-slate-900">Arena Empty</h2>
                <p className="text-slate-500">No questions match your current profile.</p>
                <button onClick={() => router.back()} className="mt-6 text-indigo-600 font-bold">Return to Dashboard</button>
            </div>
        </div>
    );

    const options = JSON.parse(question.options || '[]');

    return (
        <div className="min-h-screen bg-[#F8FAFC] pb-20 font-sans">
            {/* Header / Stats Bar */}
            <div className="bg-white border-b border-slate-200 sticky top-0 z-30">
                <div className="max-w-5xl mx-auto px-6 py-4 flex items-center justify-between">
                    <div className="flex items-center gap-4">
                        <div className="w-12 h-12 bg-indigo-900 rounded-2xl flex items-center justify-center shadow-lg shadow-indigo-100">
                            <BrainCircuit className="w-6 h-6 text-white" />
                        </div>
                        <div>
                            <h1 className="text-lg font-black text-slate-900 tracking-tight">Adaptive Practice Arena</h1>
                            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-0.5">Nurturing Mastery Room</p>
                        </div>
                    </div>
                    
                    <div className="flex items-center gap-6">
                        <div className="flex items-center gap-2 bg-rose-50 px-4 py-2 rounded-2xl border border-rose-100">
                            <Flame className={`w-5 h-5 ${streak > 0 ? 'text-orange-500 animate-bounce' : 'text-slate-300'}`} />
                            <span className="text-sm font-black text-slate-900">{streak} Streak</span>
                        </div>
                        <div className="flex items-center gap-2 bg-indigo-50 px-4 py-2 rounded-2xl border border-indigo-100">
                            <Target className="w-5 h-5 text-indigo-600" />
                            <span className="text-sm font-black text-slate-900">{stats.correct}/{stats.total} Session</span>
                        </div>
                    </div>
                </div>
            </div>

            <div className="max-w-4xl mx-auto px-6 mt-12">
                <AnimatePresence mode="wait">
                    <motion.div 
                        key={question.id}
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.95 }}
                        className="space-y-8"
                    >
                        {/* Question Card */}
                        <div className="bg-white rounded-[40px] p-10 border border-slate-200 shadow-sm relative overflow-hidden">
                            <div className="absolute top-0 right-0 p-8 text-[10px] font-black text-slate-300 uppercase tracking-widest leading-none">
                                Q-ID: {question.id.slice(-6)}
                            </div>
                            <div className="mb-6">
                                <span className="px-3 py-1 bg-indigo-50 text-indigo-700 text-[10px] font-black uppercase rounded-full tracking-widest">{question.subject} &bull; {question.topic}</span>
                            </div>
                            <div className="text-xl font-bold text-slate-900 leading-relaxed mb-4">
                                <MathRenderer content={question.content} />
                            </div>
                            <QuestionTags tags={question.tags} className="mb-10" />

                            <div className="grid grid-cols-1 gap-4">
                                {options.map((opt: string, idx: number) => {
                                    const letter = String.fromCharCode(65 + idx);
                                    const isSelected = selectedOption === letter;
                                    const isCorrect = isSubmitted && letter === question.correctAnswer;
                                    const isWrong = isSubmitted && isSelected && letter !== question.correctAnswer;

                                    return (
                                        <div 
                                            key={idx}
                                            onClick={() => handleOptionSelect(letter)}
                                            className={`flex items-center gap-6 p-5 rounded-2xl border-2 transition-all cursor-pointer group ${
                                                isCorrect ? 'border-emerald-500 bg-emerald-50/50' :
                                                isWrong ? 'border-rose-500 bg-rose-50/50' :
                                                isSelected ? 'border-indigo-600 bg-indigo-50/30' :
                                                'border-slate-100 hover:border-indigo-300 hover:bg-slate-50/50'
                                            }`}
                                        >
                                            <div className={`shrink-0 w-10 h-10 rounded-xl border-2 flex items-center justify-center font-black text-sm transition-colors ${
                                                isCorrect ? 'bg-emerald-500 border-emerald-500 text-white' :
                                                isWrong ? 'bg-rose-500 border-rose-500 text-white' :
                                                isSelected ? 'border-indigo-600 bg-indigo-600 text-white' :
                                                'border-slate-200 bg-white text-slate-400 group-hover:border-indigo-300 group-hover:text-indigo-600'
                                            }`}>
                                                {letter}
                                            </div>
                                            <div className="text-lg font-bold text-slate-700">
                                                <MathRenderer content={opt} />
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>

                            <div className="mt-12 pt-8 border-t border-slate-100 flex justify-between items-center">
                                <button 
                                    onClick={getHint}
                                    disabled={isHintLoading || isSubmitted}
                                    className="flex items-center gap-2 text-indigo-600 font-black text-xs uppercase tracking-widest hover:text-indigo-700 disabled:opacity-30"
                                >
                                    {isHintLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
                                    Ask Doubt Buddy for a Hint 🤖
                                </button>
                                
                                {!isSubmitted ? (
                                    <button 
                                        onClick={handleSubmit}
                                        disabled={!selectedOption}
                                        className="bg-slate-900 text-white px-10 py-4 rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-slate-800 disabled:opacity-30 transition-all shadow-xl shadow-slate-200"
                                    >
                                        Verify Attempt
                                    </button>
                                ) : (
                                    <button 
                                        onClick={fetchNextQuestion}
                                        className="bg-indigo-600 text-white px-10 py-4 rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-indigo-700 transition-all shadow-xl shadow-indigo-100 flex items-center gap-2"
                                    >
                                        Next Challenge <ArrowRight className="w-4 h-4" />
                                    </button>
                                )}
                            </div>
                        </div>

                        {/* Hint / Solution Panel */}
                        {hint && (
                            <motion.div 
                                initial={{ opacity: 0, x: -20 }}
                                animate={{ opacity: 1, x: 0 }}
                                className="bg-amber-50 border border-amber-200 rounded-3xl p-8 relative"
                            >
                                <div className="flex gap-4">
                                    <div className="w-10 h-10 bg-white rounded-xl shadow-sm flex items-center justify-center shrink-0">
                                        <MessageSquareQuote className="w-6 h-6 text-amber-500" />
                                    </div>
                                    <div className="space-y-2">
                                        <p className="text-[10px] font-black text-amber-600 uppercase tracking-[0.2em]">Doubt Buddy Hint</p>
                                        <div className="text-sm font-bold text-amber-900 leading-relaxed italic">
                                            <MathRenderer content={hint} />
                                        </div>
                                    </div>
                                </div>
                            </motion.div>
                        )}

                        {isSubmitted && (
                            <motion.div 
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                className={`rounded-3xl p-8 ${selectedOption === question.correctAnswer ? 'bg-emerald-50 border border-emerald-100' : 'bg-rose-50 border border-rose-100'}`}
                            >
                                <div className="flex gap-4">
                                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 bg-white shadow-sm`}>
                                        {selectedOption === question.correctAnswer ? <CheckCircle2 className="w-6 h-6 text-emerald-500" /> : <XCircle className="w-6 h-6 text-rose-500" />}
                                    </div>
                                    <div className="space-y-4">
                                        <p className={`text-[10px] font-black uppercase tracking-[0.2em] ${selectedOption === question.correctAnswer ? 'text-emerald-600' : 'text-rose-600'}`}>
                                            Detailed Resolution
                                        </p>
                                        <div className="text-sm font-medium text-slate-800 leading-relaxed">
                                            <MathRenderer content={question.explanation || 'No solution provided. Review the core concepts of this topic.'} />
                                        </div>
                                    </div>
                                </div>
                            </motion.div>
                        )}
                    </motion.div>
                </AnimatePresence>
            </div>
        </div>
    );
}
