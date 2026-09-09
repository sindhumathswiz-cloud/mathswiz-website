'use client';

import React, { useState, useEffect, useRef, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
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
    HelpCircle,
    Sparkles,
    SlidersHorizontal,
    Wand2,
    RotateCcw,
    Clock,
    SkipForward
} from 'lucide-react';
import MathRenderer from '@/components/MathRenderer';
import QuestionTags from '@/components/QuestionTags';
import toast from 'react-hot-toast';
import { motion, AnimatePresence } from 'framer-motion';
import { parseQuestionOptions } from '@/lib/arena-answer';
import { readJsonResponse } from '@/lib/http-json';

const DIFFICULTIES = ['EASY', 'MEDIUM', 'HARD'] as const;

export default function PracticeArena() {
    return (
        <Suspense fallback={
            <div className="h-screen flex items-center justify-center bg-slate-50">
                <Loader2 className="w-12 h-12 animate-spin text-indigo-600" />
            </div>
        }>
            <PracticeArenaInner />
        </Suspense>
    );
}

function PracticeArenaInner() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const [question, setQuestion] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [selectedOption, setSelectedOption] = useState<string | null>(null);
    const [isSubmitted, setIsSubmitted] = useState(false);
    const [hint, setHint] = useState<string | null>(null);
    const [isHintLoading, setIsHintLoading] = useState(false);
    const [streak, setStreak] = useState(0);
    const [startTime, setStartTime] = useState(Date.now());
    const [stats, setStats] = useState({ correct: 0, total: 0 });

    // Practice setup: which topic/difficulty to pull from, a queue of
    // AI-generated or mistake-review questions waiting to be shown, and the
    // student's own weakest topics (for the "Recommended for you" shortcuts).
    const [showSetup, setShowSetup] = useState(false);
    const [topicFilter, setTopicFilter] = useState('');
    const [difficultyFilter, setDifficultyFilter] = useState('');
    const [isGenerating, setIsGenerating] = useState(false);
    const [recommended, setRecommended] = useState<string[]>([]);
    const queueRef = useRef<any[]>([]);
    const [queueCount, setQueueCount] = useState(0);

    // Mistake-revision queue: questions the student previously got wrong and
    // hasn't corrected since. mistakesDue is the count that's actually due
    // on the spaced-review schedule (shown as a nudge); isReviewingMistakes
    // tracks whether the current session queue came from "review my mistakes".
    const [mistakesDue, setMistakesDue] = useState(0);
    const [isReviewingMistakes, setIsReviewingMistakes] = useState(false);
    const [isLoadingMistakes, setIsLoadingMistakes] = useState(false);

    // Per-question stopwatch, purely for the on-screen display. The value
    // actually persisted with the attempt is computed separately from
    // `startTime` at submit/skip time, so a throttled background tab can
    // never under-count what gets stored — only the live ticker.
    const [elapsedSeconds, setElapsedSeconds] = useState(0);

    useEffect(() => {
        fetchRecommendedTopics();
        fetchMistakesDue();
        if (searchParams?.get('mode') === 'mistakes') {
            handleReviewMistakes();
        } else {
            fetchNextQuestion();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Ticks every second while a question is live, freezes the instant it's
    // answered/skipped, and resets when the next question loads.
    useEffect(() => {
        if (!question || isSubmitted) return;
        setElapsedSeconds(0);
        const id = setInterval(() => setElapsedSeconds((s) => s + 1), 1000);
        return () => clearInterval(id);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [question?.id, isSubmitted]);

    const formatElapsed = (totalSeconds: number) => {
        const m = Math.floor(totalSeconds / 60).toString().padStart(2, '0');
        const s = (totalSeconds % 60).toString().padStart(2, '0');
        return `${m}:${s}`;
    };

    const fetchRecommendedTopics = async () => {
        try {
            const res = await fetch('/api/student/mastery');
            const data = await readJsonResponse<{ topics?: { topic: string; masteryScore: number }[] }>(res);
            if (res.ok && Array.isArray(data?.topics)) {
                // /api/student/mastery already sorts weakest-first.
                setRecommended(data.topics.slice(0, 3).map(t => t.topic).filter(Boolean));
            }
        } catch (err) {
            // Non-critical — the setup panel just shows no shortcuts.
        }
    };

    const fetchMistakesDue = async () => {
        try {
            const res = await fetch('/api/student/practice/mistakes');
            const data = await readJsonResponse<{ dueCount?: number }>(res);
            if (res.ok && typeof data?.dueCount === 'number') setMistakesDue(data.dueCount);
        } catch (err) {
            // Non-critical — the badge just doesn't show.
        }
    };

    const handleReviewMistakes = async () => {
        setIsLoadingMistakes(true);
        try {
            const res = await fetch('/api/student/practice/mistakes?scope=all');
            const data = await readJsonResponse<{ questions?: any[] }>(res);
            if (!res.ok || !Array.isArray(data?.questions) || data.questions.length === 0) {
                toast.error("No mistakes to review right now — nice work!");
                return;
            }
            queueRef.current = [...data.questions];
            setQueueCount(queueRef.current.length);
            setIsReviewingMistakes(true);
            setShowSetup(false);
            fetchNextQuestion();
        } catch (err) {
            toast.error("Could not load your mistakes right now.");
        } finally {
            setIsLoadingMistakes(false);
        }
    };

    const fetchNextQuestion = async (overrides?: { topic?: string; difficulty?: string }) => {
        setLoading(true);
        setSelectedOption(null);
        setIsSubmitted(false);
        setHint(null);
        setStartTime(Date.now());

        // Serve from the queue first (AI-generated or mistake-review), if
        // there's anything in it.
        const queued = queueRef.current.shift();
        setQueueCount(queueRef.current.length);
        if (queued) {
            setQuestion(queued);
            setLoading(false);
            return;
        }
        if (isReviewingMistakes) {
            // Queue just ran out — the review session is over. Fall back to
            // ordinary adaptive practice rather than showing "Arena Empty".
            setIsReviewingMistakes(false);
            fetchMistakesDue();
        }

        try {
            const topic = overrides?.topic ?? topicFilter;
            const difficulty = overrides?.difficulty ?? difficultyFilter;
            const params = new URLSearchParams();
            if (topic) params.set('topic', topic);
            if (difficulty) params.set('difficulty', difficulty);
            const qs = params.toString();
            const res = await fetch(`/api/student/practice/next${qs ? `?${qs}` : ''}`);
            if (!res.ok) throw new Error('No questions available');
            const data = await readJsonResponse<{ question?: unknown }>(res);
            if (!data?.question) throw new Error('Question response was empty or invalid');
            setQuestion(data.question);
        } catch (err) {
            toast.error("Could not fetch question");
        } finally {
            setLoading(false);
        }
    };

    const handlePracticeTopic = (topic: string) => {
        setTopicFilter(topic);
        setShowSetup(false);
        fetchNextQuestion({ topic });
    };

    const handleGenerate = async () => {
        if (!topicFilter.trim()) return toast.error("Enter a topic first");
        setIsGenerating(true);
        try {
            const res = await fetch('/api/student/practice/generate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ topic: topicFilter, difficulty: difficultyFilter || 'MEDIUM', count: 5 }),
            });
            const data = await readJsonResponse<{ success?: boolean; questions?: any[]; error?: string; generated?: number }>(res);
            if (!res.ok || !data?.success || !Array.isArray(data.questions) || data.questions.length === 0) {
                toast.error(data?.error || 'Could not generate new questions right now.');
                return;
            }
            queueRef.current.push(...data.questions);
            setQueueCount(queueRef.current.length);
            toast.success(
                data.generated ? `Generated ${data.generated} new question${data.generated === 1 ? '' : 's'}!` : 'Loaded matching questions from the bank!'
            );
            setShowSetup(false);
            fetchNextQuestion({ topic: topicFilter, difficulty: difficultyFilter });
        } catch (err) {
            toast.error("The generator could not be reached. Please try again.");
        } finally {
            setIsGenerating(false);
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

    const handleSkip = async () => {
        if (!question || isSubmitted) return;
        const timeSpent = Math.floor((Date.now() - startTime) / 1000);
        const skippedId = question.id;

        // A skip breaks the streak, same as a miss — it isn't counted
        // against session accuracy though, since no answer was attempted.
        setStreak(0);

        try {
            await fetch('/api/student/practice/submit', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ questionId: skippedId, skipped: true, timeSpent })
            });
        } catch (err) {
            console.error("Failed to record skip");
        }

        toast("Skipped — moving on.", { icon: '⏭️' });
        fetchNextQuestion();
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
            const data = await readJsonResponse<{ hint?: string }>(res);
            if (!res.ok || !data?.hint) throw new Error('Hint response was empty or invalid');
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
            <div className="text-center max-w-sm">
                <HelpCircle className="w-16 h-16 text-slate-300 mx-auto mb-4" />
                <h2 className="text-xl font-bold text-slate-900">Arena Empty</h2>
                <p className="text-slate-500 mb-6">
                    {topicFilter || difficultyFilter
                        ? `No approved questions match "${topicFilter || 'this'}"${difficultyFilter ? ` at ${difficultyFilter}` : ''} yet.`
                        : 'No questions match your current profile.'}
                </p>
                <div className="flex flex-col gap-3 items-center">
                    {(topicFilter || difficultyFilter) && (
                        <>
                            <button
                                onClick={handleGenerate}
                                disabled={isGenerating || !topicFilter.trim()}
                                className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 text-white font-black px-6 py-3 rounded-2xl text-xs uppercase tracking-widest transition-all"
                            >
                                {isGenerating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wand2 className="w-4 h-4" />}
                                Generate Questions For This Topic
                            </button>
                            <button
                                onClick={() => { setTopicFilter(''); setDifficultyFilter(''); fetchNextQuestion({ topic: '', difficulty: '' }); }}
                                className="text-indigo-600 font-bold text-sm"
                            >
                                Clear filters
                            </button>
                        </>
                    )}
                    <button onClick={() => router.back()} className="text-slate-400 font-bold text-sm">Return to Dashboard</button>
                </div>
            </div>
        </div>
    );

    const options = parseQuestionOptions(question.options);

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
                        <div className="flex items-center gap-2 bg-slate-100 px-4 py-2 rounded-2xl border border-slate-200">
                            <Clock className={`w-5 h-5 ${isSubmitted ? 'text-slate-300' : 'text-slate-500'}`} />
                            <span className="text-sm font-black text-slate-900 tabular-nums">{formatElapsed(elapsedSeconds)}</span>
                        </div>
                        {mistakesDue > 0 && !isReviewingMistakes && (
                            <button
                                onClick={handleReviewMistakes}
                                disabled={isLoadingMistakes}
                                className="flex items-center gap-2 px-4 py-2 rounded-2xl bg-amber-500 hover:bg-amber-600 text-white font-black text-xs uppercase tracking-widest transition-colors shadow-lg shadow-amber-200 disabled:opacity-60"
                            >
                                {isLoadingMistakes ? <Loader2 className="w-4 h-4 animate-spin" /> : <RotateCcw className="w-4 h-4" />}
                                Review {mistakesDue} Mistake{mistakesDue === 1 ? '' : 's'}
                            </button>
                        )}
                        <button
                            onClick={() => setShowSetup(s => !s)}
                            className={`flex items-center gap-2 px-4 py-2 rounded-2xl border font-black text-xs uppercase tracking-widest transition-colors ${showSetup ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-500 border-slate-200 hover:border-indigo-300 hover:text-indigo-600'}`}
                        >
                            <SlidersHorizontal className="w-4 h-4" /> Setup
                        </button>
                    </div>
                </div>

                {/* Practice setup: topic/difficulty filter + on-demand AI generation */}
                <AnimatePresence>
                    {showSetup && (
                        <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: 'auto', opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            className="border-t border-slate-100 overflow-hidden"
                        >
                            <div className="max-w-5xl mx-auto px-6 py-6 space-y-5">
                                {recommended.length > 0 && (
                                    <div>
                                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 flex items-center gap-1.5">
                                            <Sparkles className="w-3.5 h-3.5 text-indigo-500" /> Recommended for you — needs the most work
                                        </p>
                                        <div className="flex flex-wrap gap-2">
                                            {recommended.map(topic => (
                                                <button
                                                    key={topic}
                                                    onClick={() => handlePracticeTopic(topic)}
                                                    className="px-4 py-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded-xl text-xs font-bold transition"
                                                >
                                                    {topic}
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                <div className="flex flex-wrap items-end gap-4">
                                    <div className="flex-1 min-w-[200px] space-y-1.5">
                                        <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Topic</label>
                                        <input
                                            type="text"
                                            value={topicFilter}
                                            onChange={e => setTopicFilter(e.target.value)}
                                            placeholder="e.g. Integrals, Probability"
                                            className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl px-4 py-3 text-sm font-bold text-slate-900 focus:outline-none focus:border-indigo-400 focus:bg-white transition-all"
                                        />
                                    </div>
                                    <div className="space-y-1.5">
                                        <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Difficulty</label>
                                        <div className="flex gap-2">
                                            <button
                                                onClick={() => setDifficultyFilter('')}
                                                className={`px-4 py-3 rounded-2xl text-[10px] font-black transition-all ${difficultyFilter === '' ? 'bg-slate-900 text-white' : 'bg-slate-50 text-slate-400 hover:bg-slate-100'}`}
                                            >
                                                ANY
                                            </button>
                                            {DIFFICULTIES.map(d => (
                                                <button
                                                    key={d}
                                                    onClick={() => setDifficultyFilter(d)}
                                                    className={`px-4 py-3 rounded-2xl text-[10px] font-black transition-all ${difficultyFilter === d ? 'bg-slate-900 text-white' : 'bg-slate-50 text-slate-400 hover:bg-slate-100'}`}
                                                >
                                                    {d}
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                    <button
                                        onClick={() => { setShowSetup(false); fetchNextQuestion(); }}
                                        className="bg-slate-900 hover:bg-slate-800 text-white font-black px-6 py-3 rounded-2xl text-xs uppercase tracking-widest transition-all"
                                    >
                                        Apply Filter
                                    </button>
                                    <button
                                        onClick={handleGenerate}
                                        disabled={isGenerating || !topicFilter.trim()}
                                        className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed text-white font-black px-6 py-3 rounded-2xl text-xs uppercase tracking-widest transition-all shadow-lg shadow-indigo-100"
                                    >
                                        {isGenerating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wand2 className="w-4 h-4" />}
                                        Generate 5 New Questions
                                    </button>
                                </div>
                                <p className="text-[11px] text-slate-400 font-medium">
                                    Generated questions go straight into this session's queue. They also join the question bank pending a teacher's review before other students see them.
                                </p>
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>

            <div className="max-w-4xl mx-auto px-6 mt-12">
                {isReviewingMistakes && (
                    <div className="mb-6 flex items-center gap-3 bg-amber-50 border border-amber-200 rounded-2xl px-5 py-3">
                        <RotateCcw className="w-4 h-4 text-amber-600 shrink-0" />
                        <p className="text-sm font-bold text-amber-800">
                            Reviewing your mistakes — {queueCount + 1} left this session.
                            {typeof question.missCount === 'number' && question.missCount > 1 && (
                                <span className="text-amber-600"> You've missed this one {question.missCount} times.</span>
                            )}
                        </p>
                    </div>
                )}
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

                            {options.length === 0 && (
                                <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm font-bold text-amber-800">
                                    This question has an invalid or incomplete option list. You can skip it safely.
                                </div>
                            )}

                            <div className="mt-12 pt-8 border-t border-slate-100 flex justify-between items-center">
                                <button 
                                    onClick={getHint}
                                    disabled={isHintLoading || isSubmitted}
                                    className="flex items-center gap-2 text-indigo-600 font-black text-xs uppercase tracking-widest hover:text-indigo-700 disabled:opacity-30"
                                >
                                    {isHintLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
                                    Ask Doubt Buddy for a Hint 🤖
                                </button>
                                
                                {options.length === 0 ? (
                                    <button
                                        onClick={handleSkip}
                                        className="bg-amber-600 text-white px-10 py-4 rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-amber-700 transition-all"
                                    >
                                        Skip Invalid Question
                                    </button>
                                ) : !isSubmitted ? (
                                    <div className="flex items-center gap-3">
                                        <button
                                            onClick={handleSkip}
                                            className="flex items-center gap-2 text-slate-500 hover:text-slate-800 border-2 border-slate-200 hover:border-slate-300 px-6 py-4 rounded-2xl font-black text-xs uppercase tracking-widest transition-all"
                                        >
                                            <SkipForward className="w-4 h-4" /> Skip
                                        </button>
                                        <button
                                            onClick={handleSubmit}
                                            disabled={!selectedOption}
                                            className="bg-slate-900 text-white px-10 py-4 rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-slate-800 disabled:opacity-30 transition-all shadow-xl shadow-slate-200"
                                        >
                                            Verify Attempt
                                        </button>
                                    </div>
                                ) : (
                                    <button
                                        onClick={() => fetchNextQuestion()}
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
