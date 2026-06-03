'use client';

import React, { useState, useEffect, useRef } from 'react';
import { 
    Zap, Brain, ArrowRight, CheckCircle2, XCircle, 
    MessageSquare, Lightbulb, ChevronRight, Loader2, Bot, Trophy, RotateCcw
} from 'lucide-react';
import { toast } from 'react-hot-toast';
import "katex/dist/katex.min.css";
import { BlockMath, InlineMath } from 'react-katex';
import { savePracticeSessionAction } from '@/actions/practiceActions';

interface AdaptivePracticeArenaProps {
    questions: any[];
    userId: string;
}

export default function AdaptivePracticeArena({ questions: initialQuestions, userId }: AdaptivePracticeArenaProps) {
    const [questions] = useState<any[]>(initialQuestions);
    const [currentIndex, setCurrentIndex] = useState(0);
    const [selectedOption, setSelectedOption] = useState<number | null>(null);
    const [isSubmitted, setIsSubmitted] = useState(false);
    const [showHint, setShowHint] = useState(false);
    const [streak, setStreak] = useState(0);
    const [history, setHistory] = useState<{questionId: string, isCorrect: boolean}[]>([]);
    const [isComplete, setIsComplete] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const sessionStartRef = useRef<Date>(new Date());

    const currentQuestion = questions[currentIndex];
    const options = currentQuestion?.options_latex 
        ? (typeof currentQuestion.options_latex === 'string' 
            ? JSON.parse(currentQuestion.options_latex) 
            : currentQuestion.options_latex) 
        : [];

    const handleOptionSelect = (idx: number) => {
        if (isSubmitted) return;
        setSelectedOption(idx);
    };

    const handleSubmit = () => {
        if (selectedOption === null) return toast.error("Select an option first!");
        
        const isCorrect = selectedOption === currentQuestion.correct_option_index;
        setIsSubmitted(true);
        
        if (isCorrect) {
            setStreak(prev => prev + 1);
            toast.success("Correct! High five! 🙌");
        } else {
            setStreak(0);
            setShowHint(true);
            toast.error("Not quite right. Let's learn together.");
        }

        setHistory(prev => [...prev, { questionId: currentQuestion.id, isCorrect }]);
    };

    const handleNext = async () => {
        if (currentIndex < questions.length - 1) {
            setCurrentIndex(prev => prev + 1);
            setSelectedOption(null);
            setIsSubmitted(false);
            setShowHint(false);
        } else {
            // Session Complete — save to DB
            setIsSaving(true);
            const correctCount = history.filter(h => h.isCorrect).length + (isSubmitted && selectedOption === currentQuestion.correct_option_index ? 1 : 0);
            const incorrectCount = history.length + (isSubmitted ? 1 : 0) - correctCount;
            const durationSeconds = Math.round((new Date().getTime() - sessionStartRef.current.getTime()) / 1000);

            try {
                await savePracticeSessionAction({
                    userId,
                    totalCorrect: correctCount,
                    totalIncorrect: incorrectCount,
                    totalSkipped: 0,
                    totalScore: correctCount * 4, // 4 marks per correct (standard)
                    durationSeconds,
                });
                toast.success("Session saved to your analytics! 🎉");
            } catch (err) {
                console.error("Failed to save practice session:", err);
                toast.error("Couldn't save session. Your progress was still tracked locally.");
            } finally {
                setIsSaving(false);
                setIsComplete(true);
            }
        }
    };

    // Final completion screen
    if (isComplete) {
        const correctCount = history.filter(h => h.isCorrect).length;
        const accuracy = history.length > 0 ? Math.round((correctCount / history.length) * 100) : 0;

        return (
            <div className="max-w-2xl mx-auto text-center py-16 animate-in fade-in duration-500">
                <div className="bg-gradient-to-br from-indigo-900 to-purple-900 rounded-[3rem] p-12 text-white shadow-2xl relative overflow-hidden">
                    <div className="absolute inset-0 opacity-10">
                        <Trophy className="w-64 h-64 absolute -bottom-8 -right-8 rotate-12" />
                    </div>
                    <div className="relative z-10">
                        <div className="w-20 h-20 bg-amber-400 rounded-3xl flex items-center justify-center mx-auto mb-6 shadow-xl shadow-amber-500/30">
                            <Trophy className="w-10 h-10 text-amber-900" />
                        </div>
                        <h2 className="text-3xl font-black mb-2">Arena Conquered! 🎉</h2>
                        <p className="text-indigo-200 font-medium mb-10">Your results have been saved to your analytics.</p>
                        
                        <div className="grid grid-cols-3 gap-6 mb-10">
                            <div className="bg-white/10 rounded-2xl p-5 border border-white/10">
                                <p className="text-[10px] font-black uppercase tracking-widest text-indigo-300 mb-2">Correct</p>
                                <p className="text-4xl font-black text-emerald-400">{correctCount}</p>
                            </div>
                            <div className="bg-white/10 rounded-2xl p-5 border border-white/10">
                                <p className="text-[10px] font-black uppercase tracking-widest text-indigo-300 mb-2">Accuracy</p>
                                <p className="text-4xl font-black">{accuracy}%</p>
                            </div>
                            <div className="bg-white/10 rounded-2xl p-5 border border-white/10">
                                <p className="text-[10px] font-black uppercase tracking-widest text-indigo-300 mb-2">Score</p>
                                <p className="text-4xl font-black text-amber-400">{correctCount * 4}</p>
                            </div>
                        </div>

                        <div className="flex gap-4 justify-center">
                            <button 
                                onClick={() => window.location.reload()}
                                className="flex items-center gap-2 bg-white/20 hover:bg-white/30 px-6 py-3 rounded-2xl font-bold text-sm transition border border-white/20"
                            >
                                <RotateCcw size={16} /> Practice Again
                            </button>
                            <a 
                                href="/student/performance"
                                className="flex items-center gap-2 bg-indigo-500 hover:bg-indigo-400 px-6 py-3 rounded-2xl font-bold text-sm transition shadow-lg shadow-indigo-500/30"
                            >
                                View Analytics <ArrowRight size={16} />
                            </a>
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    if (!currentQuestion) {
        return (
            <div className="flex flex-col items-center justify-center py-20 bg-slate-50 rounded-3xl border-2 border-dashed border-slate-200">
                <Brain className="w-16 h-16 text-slate-300 mb-4" />
                <p className="text-slate-500 font-bold">No practice questions available for this topic yet.</p>
            </div>
        );
    }

    return (
        <div className="max-w-4xl mx-auto space-y-6 animate-in fade-in duration-500">
            {/* Header: Progress & Streak */}
            <div className="flex items-center justify-between bg-white p-4 rounded-2xl shadow-sm border border-slate-100">
                <div className="flex items-center gap-4">
                    <div className="w-12 h-12 bg-indigo-50 rounded-xl flex items-center justify-center text-indigo-600">
                        <Zap size={24} />
                    </div>
                    <div>
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest leading-none mb-1">Current Streak</p>
                        <p className="text-xl font-black text-slate-900 leading-none">{streak} 🔥</p>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    {history.map((h, i) => (
                        <div key={i} className={`w-2 h-2 rounded-full ${h.isCorrect ? 'bg-emerald-500' : 'bg-rose-500'}`} />
                    ))}
                    <span className="text-xs font-bold text-slate-400 ml-2">Question {currentIndex + 1} of {questions.length}</span>
                </div>
            </div>

            {/* Question Card */}
            <div className="bg-white rounded-3xl shadow-xl shadow-slate-200/50 border border-slate-100 overflow-hidden">
                <div className="p-8 border-b border-slate-50">
                    <div className="flex items-center gap-2 mb-6">
                        <span className="px-3 py-1 bg-indigo-50 text-indigo-600 rounded-lg text-[10px] font-black uppercase tracking-widest">{currentQuestion.subject || 'Practice'}</span>
                        <span className="px-3 py-1 bg-slate-50 text-slate-500 rounded-lg text-[10px] font-black uppercase tracking-widest">{currentQuestion.topic || 'General'}</span>
                    </div>
                    <div className="text-xl font-medium text-slate-800 leading-relaxed">
                        <BlockMath math={currentQuestion.text_latex} />
                    </div>
                </div>

                <div className="p-8 space-y-3">
                    {options.map((opt: string, idx: number) => {
                        let borderColor = "border-slate-100";
                        let bgColor = "hover:bg-slate-50";
                        let textColor = "text-slate-700";

                        if (selectedOption === idx) {
                            borderColor = "border-indigo-500 ring-2 ring-indigo-500/20";
                            bgColor = "bg-indigo-50";
                        }

                        if (isSubmitted) {
                            if (idx === currentQuestion.correct_option_index) {
                                borderColor = "border-emerald-500 ring-4 ring-emerald-500/10";
                                bgColor = "bg-emerald-50";
                                textColor = "text-emerald-900";
                            } else if (selectedOption === idx) {
                                borderColor = "border-rose-500 ring-4 ring-rose-500/10";
                                bgColor = "bg-rose-50";
                                textColor = "text-rose-900";
                            }
                        }

                        return (
                            <button
                                key={idx}
                                disabled={isSubmitted}
                                onClick={() => handleOptionSelect(idx)}
                                className={`w-full text-left p-5 rounded-2xl border-2 transition-all duration-200 flex items-center justify-between ${borderColor} ${bgColor} ${textColor}`}
                            >
                                <span className="flex items-center gap-4">
                                    <span className="w-8 h-8 rounded-lg bg-white border border-slate-200 flex items-center justify-center font-bold text-xs uppercase shadow-sm">
                                        {String.fromCharCode(65 + idx)}
                                    </span>
                                    <span className="font-bold"><InlineMath math={opt} /></span>
                                </span>
                                {isSubmitted && idx === currentQuestion.correct_option_index && <CheckCircle2 className="text-emerald-500 w-5 h-5 animate-in zoom-in" />}
                                {isSubmitted && selectedOption === idx && idx !== currentQuestion.correct_option_index && <XCircle className="text-rose-500 w-5 h-5 animate-in zoom-in" />}
                            </button>
                        );
                    })}
                </div>

                {/* Submit / Next Footer */}
                <div className="p-8 bg-slate-50 flex items-center justify-between border-t border-slate-100">
                    <button 
                        onClick={() => setShowHint(!showHint)}
                        className={`flex items-center gap-2 px-6 py-3 rounded-xl font-bold text-xs transition-all duration-200 ${showHint ? 'bg-amber-100 text-amber-700' : 'bg-white text-slate-500 hover:text-indigo-600 shadow-sm'}`}
                    >
                        <Lightbulb size={16} /> Doubt Buddy
                    </button>

                    {!isSubmitted ? (
                        <button 
                            onClick={handleSubmit}
                            disabled={selectedOption === null}
                            className="bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-black px-10 py-3 rounded-2xl transition shadow-lg shadow-indigo-200 flex items-center gap-2 uppercase tracking-widest text-xs"
                        >
                            Submit Answer <ChevronRight size={16} />
                        </button>
                    ) : (
                        <button 
                            onClick={handleNext}
                            disabled={isSaving}
                            className="bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white font-black px-10 py-3 rounded-2xl transition shadow-lg shadow-emerald-200 flex items-center gap-2 uppercase tracking-widest text-xs"
                        >
                            {isSaving ? (
                                <><Loader2 size={16} className="animate-spin" /> Saving...</>
                            ) : currentIndex < questions.length - 1 ? (
                                <>Next Question <ArrowRight size={16} /></>
                            ) : (
                                <>Finish Session <Trophy size={16} /></>
                            )}
                        </button>
                    )}
                </div>
            </div>

            {/* Doubt Buddy AI Workspace */}
            {showHint && (
                <div className="bg-indigo-900 text-indigo-100 rounded-3xl p-8 shadow-2xl animate-in slide-in-from-bottom duration-300 relative overflow-hidden">
                    <div className="absolute top-0 right-0 p-8 opacity-10 rotate-12">
                        <Bot size={120} />
                    </div>
                    <div className="relative z-10">
                        <div className="flex items-center gap-3 mb-6">
                            <div className="w-10 h-10 bg-indigo-500 rounded-xl flex items-center justify-center">
                                <MessageSquare size={20} className="text-white" />
                            </div>
                            <div>
                                <h4 className="text-sm font-black uppercase tracking-widest text-indigo-300">Doubt Buddy Solution</h4>
                                <p className="text-xs font-medium text-indigo-400 italic">Step-by-step master breakdown</p>
                            </div>
                        </div>
                        
                        <div className="prose prose-invert max-w-none">
                            <div className="text-lg leading-relaxed font-medium">
                                {currentQuestion.solution_latex ? (
                                    <BlockMath math={currentQuestion.solution_latex} />
                                ) : (
                                    <p className="italic opacity-60">Thinking... Our AI is generating a custom hint for this problem. Try analyzing the formula first!</p>
                                )}
                            </div>
                        </div>

                        <div className="mt-8 pt-6 border-t border-indigo-800 flex items-center gap-4">
                            <a href={`/student/doubt-buddy?questionId=${currentQuestion.id}`} className="text-[10px] font-black uppercase tracking-widest bg-indigo-800 hover:bg-indigo-700 px-4 py-2 rounded-lg transition">Ask a follow up</a>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
