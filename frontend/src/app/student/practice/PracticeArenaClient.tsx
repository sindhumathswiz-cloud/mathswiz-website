'use client';

import React, { useState, useEffect, useRef, useMemo } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import MathRenderer from '@/components/MathRenderer';
import QuestionTags from '@/components/QuestionTags';
import { 
    ChevronLeft, ChevronRight, CheckCircle, XCircle, 
    Bot, Sparkles, Timer, Zap, Trophy, Target, BookOpen,
    RotateCcw, ArrowRight
} from 'lucide-react';
import { toast } from 'react-hot-toast';
import { savePracticeAttemptAction } from '@/actions/testActions';

interface PracticeQuestion {
    id: string;
    content: string;
    options: any;
    type: string;
    tags?: string[];
    subject?: string;
    solution_latex?: string;
}

interface Props {
    initialQuestions: PracticeQuestion[];
    subjects: string[];
    currentSubject: string | null;
    currentTopic: string | null;
    userId: string;
}

export default function PracticeArenaClient({ initialQuestions, subjects, currentSubject, currentTopic, userId }: Props) {
    const router = useRouter();
    const [questions] = useState<PracticeQuestion[]>(initialQuestions);
    const [currentIndex, setCurrentIndex] = useState(0);
    const [selectedOption, setSelectedOption] = useState<string | null>(null);
    const [hasChecked, setHasChecked] = useState(false);
    const [isCorrect, setIsCorrect] = useState<boolean | null>(null);
    const [showHint, setShowHint] = useState(false);
    const [hintAttempts, setHintAttempts] = useState(0); // How many times re-tried after hint
    const [elapsedSeconds, setElapsedSeconds] = useState(0);
    const [xp, setXp] = useState(0);
    const [streak, setStreak] = useState(0);
    const [completed, setCompleted] = useState(false);
    const [correctCount, setCorrectCount] = useState(0);
    const intervalRef = useRef<NodeJS.Timeout | undefined>(undefined);
    const [selectedSubject, setSelectedSubject] = useState(currentSubject || '');

    // Stopwatch per question
    useEffect(() => {
        setElapsedSeconds(0);
        if (intervalRef.current) clearInterval(intervalRef.current);
        intervalRef.current = setInterval(() => setElapsedSeconds(s => s + 1), 1000);
        return () => clearInterval(intervalRef.current);
    }, [currentIndex]);

    // Shuffle options for each question
    const shuffledOptions = useMemo(() => {
        const q = questions[currentIndex];
        if (!q?.options) return [];
        const opts = typeof q.options === 'string' ? JSON.parse(q.options) : q.options;
        const arr = opts.map((text: string, i: number) => ({ text, letter: String.fromCharCode(65 + i) }));
        // Shuffle
        for (let i = arr.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [arr[i], arr[j]] = [arr[j], arr[i]];
        }
        return arr;
    }, [currentIndex, questions]);

    const handleCheck = () => {
        if (!selectedOption) {
            toast.error("Please select an option first!");
            return;
        }
        const q = questions[currentIndex];
        // Compare selected option letter with correctAnswer stored in DB (e.g. "A")
        const correct = selectedOption === (q as any).correctAnswer;
        setIsCorrect(correct);
        setHasChecked(true);

        if (correct) {
            const earned = hintAttempts === 0 ? 10 : 5; // Half XP if used hint
            setXp(prev => prev + earned);
            setStreak(s => s + 1);
            setCorrectCount(c => c + 1);
            toast.success(streak >= 2 ? `🔥 ${streak + 1} Streak! +${earned} XP` : `Great job! +${earned} XP`);
        } else {
            setStreak(0);
            setShowHint(true); // AUTO-TRIGGER DOUBT BUDDY HINT
            toast.error("Not quite right. Doubt Buddy has a hint for you!");
        }
    };

    const handleShowHint = () => {
        setShowHint(true);
        setSelectedOption(null);
        setHasChecked(false);
        setIsCorrect(null);
        setHintAttempts(a => a + 1);
    };

    const handleNext = () => {
        if (currentIndex >= questions.length - 1) {
            setCompleted(true);
            return;
        }
        setCurrentIndex(i => i + 1);
        setSelectedOption(null);
        setHasChecked(false);
        setIsCorrect(null);
        setShowHint(false);
        setHintAttempts(0);
    };

    const handleSubjectFilter = () => {
        if (selectedSubject) {
            router.push(`/student/practice?subject=${encodeURIComponent(selectedSubject)}`);
        } else {
            router.push('/student/practice');
        }
    };

    const formatTime = (secs: number) => {
        const m = Math.floor(secs / 60);
        const s = secs % 60;
        return `${m}m ${s.toString().padStart(2, '0')}s`;
    };

    if (!questions || questions.length === 0) {
        return (
            <div className="min-h-screen bg-gray-50 flex items-center justify-center p-8">
                <div className="max-w-md text-center bg-white rounded-3xl p-10 border border-gray-100 shadow-sm">
                    <BookOpen className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                    <h2 className="text-2xl font-black text-gray-900 mb-2">No Questions Found</h2>
                    <p className="text-gray-500 mb-6">There are no practice questions available for this filter yet. Try a different subject or check back later.</p>
                    <Link href="/student/practice" className="inline-flex items-center gap-2 bg-indigo-600 text-white px-6 py-3 rounded-xl font-bold hover:bg-indigo-700 transition">
                        <RotateCcw className="w-4 h-4" /> Clear Filters
                    </Link>
                </div>
            </div>
        );
    }

    // Save attempt logic
    useEffect(() => {
        if (completed && questions.length > 0) {
            savePracticeAttemptAction({
                userId,
                totalScore: xp,
                totalCorrect: correctCount,
                totalIncorrect: questions.length - correctCount,
                totalSkipped: 0
            }).catch(err => console.error("Failed to save practice attempt:", err));
        }
    }, [completed, questions.length, userId, xp, correctCount]);

    if (completed) {
        const accuracy = Math.round((correctCount / questions.length) * 100);
        return (
            <div className="min-h-screen bg-gradient-to-br from-indigo-900 to-purple-900 flex items-center justify-center p-8 text-white">
                <div className="max-w-md text-center bg-white/10 backdrop-blur-sm rounded-3xl p-10 border border-white/20 shadow-2xl">
                    <div className="w-24 h-24 bg-amber-400 rounded-full flex items-center justify-center mx-auto mb-6 shadow-xl shadow-amber-400/40">
                        <Trophy className="w-12 h-12 text-amber-900" />
                    </div>
                    <h2 className="text-4xl font-black mb-2">Session Complete!</h2>
                    <p className="text-indigo-200 font-medium mb-8">You crushed {questions.length} questions. Here's your summary:</p>
                    <div className="grid grid-cols-3 gap-4 mb-8">
                        <div className="bg-white/10 rounded-2xl p-4 border border-white/10">
                            <p className="text-xs text-indigo-200 font-bold uppercase tracking-widest mb-1">XP Earned</p>
                            <p className="text-3xl font-black text-amber-400">{xp}</p>
                        </div>
                        <div className="bg-white/10 rounded-2xl p-4 border border-white/10">
                            <p className="text-xs text-indigo-200 font-bold uppercase tracking-widest mb-1">Correct</p>
                            <p className="text-3xl font-black text-emerald-400">{correctCount}</p>
                        </div>
                        <div className="bg-white/10 rounded-2xl p-4 border border-white/10">
                            <p className="text-xs text-indigo-200 font-bold uppercase tracking-widest mb-1">Accuracy</p>
                            <p className="text-3xl font-black">{accuracy}%</p>
                        </div>
                    </div>
                    <div className="flex gap-3 flex-col sm:flex-row">
                        <button 
                            onClick={() => { setCurrentIndex(0); setCompleted(false); setXp(0); setStreak(0); setCorrectCount(0); }}
                            className="flex-1 bg-white/20 hover:bg-white/30 text-white font-bold py-3 rounded-xl flex items-center justify-center gap-2 transition"
                        >
                            <RotateCcw className="w-4 h-4" /> Practice Again
                        </button>
                        <Link href="/student/dashboard" className="flex-1 bg-white text-indigo-600 font-bold py-3 rounded-xl flex items-center justify-center gap-2 hover:bg-indigo-50 transition">
                            Dashboard <ArrowRight className="w-4 h-4" />
                        </Link>
                    </div>
                </div>
            </div>
        );
    }

    const currentQ = questions[currentIndex];

    return (
        <div className="min-h-screen bg-gray-50 font-sans">
            {/* Top Navigation Bar */}
            <div className="bg-white border-b border-gray-100 shadow-sm sticky top-0 z-50">
                <div className="max-w-4xl mx-auto px-4 py-3 flex items-center justify-between gap-4">
                    <Link href="/student/dashboard" className="flex items-center gap-2 text-gray-500 hover:text-gray-900 transition font-medium text-sm">
                        <ChevronLeft className="w-5 h-5" /> Dashboard
                    </Link>

                    {/* Live Stats */}
                    <div className="flex items-center gap-4">
                        <div className="flex items-center gap-1.5 bg-amber-50 text-amber-700 px-3 py-1.5 rounded-full border border-amber-200 font-bold text-sm">
                            <Zap className="w-4 h-4 text-amber-500" /> {xp} XP
                        </div>
                        {streak > 0 && (
                            <div className="flex items-center gap-1.5 bg-orange-50 text-orange-700 px-3 py-1.5 rounded-full border border-orange-200 font-bold text-sm animate-pulse">
                                🔥 {streak} Streak
                            </div>
                        )}
                        <div className="flex items-center gap-1.5 bg-gray-100 text-gray-600 px-3 py-1.5 rounded-full font-bold text-sm">
                            <Timer className="w-4 h-4" /> {formatTime(elapsedSeconds)}
                        </div>
                    </div>
                </div>
            </div>

            <div className="max-w-4xl mx-auto px-4 py-8 space-y-6">

                {/* Header */}
                <div className="flex items-start justify-between gap-4">
                    <div>
                        <div className="flex items-center gap-2 mb-2">
                            <span className="bg-indigo-100 text-indigo-700 text-xs font-black px-3 py-1 rounded-full uppercase tracking-wider">Practice Arena</span>
                            {currentQ?.subject && <span className="text-xs text-gray-500 font-bold">{currentQ.subject}</span>}
                        </div>
                        <h1 className="text-2xl font-black text-gray-900">
                            Question {currentIndex + 1}
                            <span className="text-gray-400 font-normal text-lg"> / {questions.length}</span>
                        </h1>
                    </div>

                    {/* Subject Filter */}
                    <div className="flex items-center gap-2 shrink-0">
                        <select 
                            value={selectedSubject} 
                            onChange={e => setSelectedSubject(e.target.value)}
                            className="text-sm border border-gray-200 rounded-xl px-3 py-2 text-gray-700 focus:ring-2 focus:ring-indigo-500 outline-none bg-white shadow-sm"
                        >
                            <option value="">All Subjects</option>
                            {subjects.map(s => <option key={s} value={s}>{s}</option>)}
                        </select>
                        <button onClick={handleSubjectFilter} className="bg-indigo-600 text-white px-4 py-2 rounded-xl text-sm font-bold hover:bg-indigo-700 transition shadow-sm">
                            Filter
                        </button>
                    </div>
                </div>

                {/* Progress Bar */}
                <div className="w-full bg-gray-200 rounded-full h-2">
                    <div 
                        className="bg-indigo-600 h-2 rounded-full transition-all duration-500"
                        style={{ width: `${((currentIndex) / questions.length) * 100}%` }}
                    />
                </div>

                {/* Question Card */}
                <div className="bg-white rounded-3xl border border-gray-100 shadow-sm overflow-hidden">
                    <div className="p-8 pb-6 border-b border-gray-100">
                        <div className="text-lg font-medium text-gray-800 leading-relaxed">
                            <MathRenderer content={currentQ?.content || ''} />
                        </div>
                        <QuestionTags tags={currentQ?.tags} />
                    </div>

                    {/* Options */}
                    <div className="p-6 space-y-3">
                        {shuffledOptions.map((opt: { text: string; letter: string }, idx: number) => {
                            const displayLetter = String.fromCharCode(65 + idx);
                            const isSelected = selectedOption === opt.letter;
                            let stateClass = 'border-gray-200 hover:border-indigo-300 hover:bg-indigo-50/50 cursor-pointer';
                            if (hasChecked && isSelected) {
                                stateClass = isCorrect 
                                    ? 'border-emerald-500 bg-emerald-50 cursor-default pointer-events-none'
                                    : 'border-red-400 bg-red-50 cursor-default pointer-events-none';
                            } else if (isSelected) {
                                stateClass = 'border-indigo-500 bg-indigo-50/70 cursor-pointer';
                            } else if (hasChecked) {
                                stateClass = 'border-gray-200 opacity-60 cursor-default pointer-events-none';
                            }

                            return (
                                <div
                                    key={idx}
                                    onClick={() => { if (!hasChecked) setSelectedOption(opt.letter); }}
                                    className={`flex items-center gap-4 p-4 rounded-2xl border-2 transition-all select-none ${stateClass}`}
                                >
                                    <div className={`shrink-0 w-9 h-9 rounded-full border-2 flex items-center justify-center font-black text-sm ${
                                        hasChecked && isSelected && isCorrect ? 'border-emerald-500 text-emerald-600 bg-emerald-100'
                                        : hasChecked && isSelected && !isCorrect ? 'border-red-400 text-red-600 bg-red-100'
                                        : isSelected ? 'border-indigo-500 text-indigo-600 bg-indigo-100'
                                        : 'border-gray-300 text-gray-500'
                                    }`}>
                                        {displayLetter}
                                    </div>
                                    <div className="text-sm font-medium text-gray-800 flex-1">
                                        <MathRenderer content={opt.text} />
                                    </div>
                                    {hasChecked && isSelected && (
                                        isCorrect ? <CheckCircle className="w-5 h-5 text-emerald-500 shrink-0" />
                                                  : <XCircle className="w-5 h-5 text-red-500 shrink-0" />
                                    )}
                                </div>
                            );
                        })}
                    </div>

                    {/* Hint Block (appears after wrong answer) */}
                    {showHint && currentQ?.solution_latex && (
                        <div className="mx-6 mb-6 p-5 bg-amber-50 rounded-2xl border border-amber-200">
                            <div className="flex items-start gap-3">
                                <div className="w-8 h-8 bg-amber-400 rounded-full flex items-center justify-center shrink-0 mt-0.5 shadow-sm shadow-amber-400/40">
                                    <Bot className="w-4 h-4 text-white" />
                                </div>
                                <div>
                                    <p className="text-amber-800 font-black text-sm mb-2 flex items-center gap-1.5">
                                        <Sparkles className="w-4 h-4" /> Doubt Buddy Hint
                                    </p>
                                    <div className="text-amber-900 text-sm font-medium leading-relaxed">
                                        {/* Show only first ~100 chars of solution as a hint nudge */}
                                        <MathRenderer content={currentQ.solution_latex.substring(0, 120) + (currentQ.solution_latex.length > 120 ? '...' : '')} />
                                    </div>
                                    <Link 
                                        href={`/student/doubt-buddy?questionId=${currentQ.id}`}
                                        className="inline-flex items-center gap-1.5 mt-3 text-amber-700 font-bold text-xs hover:underline"
                                    >
                                        <Bot className="w-3.5 h-3.5" /> Get full explanation from Doubt Buddy →
                                    </Link>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Action Bar */}
                    <div className="px-6 pb-6 flex flex-wrap gap-3 justify-between items-center">
                        <div className="flex gap-3">
                            {/* Check Answer */}
                            {!hasChecked ? (
                                <button 
                                    onClick={handleCheck}
                                    disabled={!selectedOption}
                                    className="bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed text-white font-black px-8 py-3 rounded-xl transition shadow-md shadow-indigo-600/20 flex items-center gap-2"
                                >
                                    <Target className="w-4 h-4" /> Check Answer
                                </button>
                            ) : isCorrect ? (
                                /* Correct: advance immediately */
                                <button 
                                    onClick={handleNext}
                                    className="bg-emerald-600 hover:bg-emerald-700 text-white font-black px-8 py-3 rounded-xl transition shadow-md shadow-emerald-600/20 flex items-center gap-2"
                                >
                                    Next Question <ChevronRight className="w-4 h-4" />
                                </button>
                            ) : (
                                /* Wrong: Show hint button + skip option */
                                <div className="flex gap-3 flex-wrap">
                                    {!showHint && (
                                        <button 
                                            onClick={handleShowHint}
                                            className="bg-gradient-to-r from-amber-400 to-orange-500 text-white font-black px-6 py-3 rounded-xl transition shadow-md shadow-orange-500/20 flex items-center gap-2 hover:scale-[1.02]"
                                        >
                                            <Bot className="w-4 h-4" /> Ask Doubt Buddy for a Hint 🤖
                                        </button>
                                    )}
                                    {showHint && (
                                        <button 
                                            onClick={() => { setHasChecked(false); setSelectedOption(null); setIsCorrect(null); }}
                                            className="bg-indigo-600 hover:bg-indigo-700 text-white font-black px-6 py-3 rounded-xl transition flex items-center gap-2"
                                        >
                                            <RotateCcw className="w-4 h-4" /> Try Again
                                        </button>
                                    )}
                                    <button 
                                        onClick={handleNext}
                                        className="bg-gray-100 hover:bg-gray-200 text-gray-600 font-bold px-6 py-3 rounded-xl transition text-sm"
                                    >
                                        Skip →
                                    </button>
                                </div>
                            )}
                        </div>

                        {/* Question count mini */}
                        <p className="text-xs text-gray-400 font-bold">
                            {currentIndex + 1} of {questions.length}
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
}
