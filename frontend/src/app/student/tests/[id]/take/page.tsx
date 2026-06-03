'use client';

import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { useSession } from 'next-auth/react';
import MathRenderer from '@/components/MathRenderer';
import { 
    ChevronRight, 
    ChevronLeft, 
    Flag, 
    Info, 
    PlayCircle, 
    ShieldAlert, 
    Loader2, 
    CheckCircle, 
    Clock, 
    XCircle,
    Activity,
    BookText
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import toast from 'react-hot-toast';

type QuestionStatus = 'NOT_VISITED' | 'NOT_ANSWERED' | 'ANSWERED' | 'MARKED_FOR_REVIEW' | 'ANSWERED_AND_MARKED';

interface TestQuestion {
    id: string;
    content: string;
    options: any;
    type: string;
    difficulty?: string;
    subject?: string;
    class?: string;
}

interface Section {
    id: string;
    title: string;
    questions: { question: TestQuestion }[];
}

export default function TestTakingUI() {
    const { data: session, status: authStatus } = useSession();
    const router = useRouter();
    const params = useParams();
    const testId = params.id as string;

    const [testData, setTestData] = useState<any>(null);
    const [attemptId, setAttemptId] = useState<string>('');
    const [allQuestions, setAllQuestions] = useState<TestQuestion[]>([]);
    
    // Core State
    const [currentIndex, setCurrentIndex] = useState(0);
    const [responses, setResponses] = useState<Record<string, { selectedOption: string | null; status: QuestionStatus; timeSpent: number }>>({});
    
    // Advanced UI & State
    const [timeLeftRemaining, setTimeLeftRemaining] = useState<number>(3600);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [warningCount, setWarningCount] = useState(0);
    const [isFullscreen, setIsFullscreen] = useState(false);
    const [testResult, setTestResult] = useState<any>(null);
    const [showInstructions, setShowInstructions] = useState(true);
    const [activeSectionId, setActiveSectionId] = useState<string>('');
    const [isOnline, setIsOnline] = useState(true);

    // Sync Timer
    const lastSyncTime = useRef(Date.now());
    const tickInterval = useRef<NodeJS.Timeout | undefined>(undefined);

    useEffect(() => {
        if (authStatus === 'unauthenticated') router.push('/');
        if (authStatus === 'authenticated' && testId && !testData) {
            initTest();
        }
    }, [authStatus, testId]);

    const initTest = async () => {
        try {
            const res = await fetch(`/api/student/tests/${testId}/start`);
            if (!res.ok) throw new Error('Test could not be loaded');
            const data = await res.json();
            
            setTestData(data.test);
            setAttemptId(data.attempt.id);
            
            const flattened: TestQuestion[] = [];
            data.test.sections.forEach((sec: Section) => {
                sec.questions.forEach(q => flattened.push(q.question));
            });
            setAllQuestions(flattened);

            const savedState = localStorage.getItem(`test_state_${testId}`);
            if (savedState) {
                const parsed = JSON.parse(savedState);
                if (parsed.attemptId === data.attempt.id) {
                    setResponses(parsed.responses);
                    setTimeLeftRemaining(parsed.timeLeft);
                    setShowInstructions(false);
                    startTimer();
                    requestFullscreen();
                } else {
                    initializeFresh(data, flattened);
                }
            } else {
                initializeFresh(data, flattened);
            }
        } catch (error) {
            console.error("Failed to start test:", error);
            toast.error("Error initiating test. It might be finished or unavailable.");
            router.push('/student/dashboard');
        }
    };

    const initializeFresh = (data: any, flattened: TestQuestion[]) => {
        const initialRes: Record<string, any> = {};
        flattened.forEach((q, i) => {
            initialRes[q.id] = { selectedOption: null, status: i === 0 ? 'NOT_ANSWERED' : 'NOT_VISITED', timeSpent: 0 };
        });
        setResponses(initialRes);
        setTimeLeftRemaining(data.test.duration * 60);
        if (data.test.sections.length > 0) {
            setActiveSectionId(data.test.sections[0].id);
        }
    };

    const handleStartTest = () => {
        setShowInstructions(false);
        startTimer();
        requestFullscreen();
    };

    const startTimer = () => {
        if (tickInterval.current) clearInterval(tickInterval.current);
        tickInterval.current = setInterval(() => {
            setTimeLeftRemaining(prev => {
                if (prev <= 1) {
                    clearInterval(tickInterval.current);
                    autoSubmitTest();
                    return 0;
                }
                return prev - 1;
            });
            
            const now = Date.now();
            const deltaSecs = Math.floor((now - lastSyncTime.current) / 1000);
            if (deltaSecs >= 1 && allQuestions.length > 0) {
                const qId = allQuestions[currentIndex]?.id;
                if (qId) {
                    setResponses(prev => ({
                        ...prev,
                        [qId]: { ...prev[qId], timeSpent: (prev[qId]?.timeSpent || 0) + deltaSecs }
                    }));
                }
                lastSyncTime.current = now;
            }
        }, 1000);
    };

    useEffect(() => {
        if (allQuestions.length > 0 && attemptId) {
            localStorage.setItem(`test_state_${testId}`, JSON.stringify({
                responses,
                timeLeft: timeLeftRemaining,
                attemptId
            }));
        }
    }, [responses, timeLeftRemaining, testId, allQuestions, attemptId]);

    useEffect(() => {
        const handleVisibilityChange = () => {
            if (document.hidden && testData?.mode === 'STRICT' && !showInstructions) {
                setWarningCount(w => {
                    const newCount = w + 1;
                    if (newCount < 3) {
                        toast.error(`WARNING ${newCount}/3: Do not leave the test environment!`, { duration: 5000 });
                    } else {
                        autoSubmitTest();
                    }
                    return newCount;
                });
            }
        };

        const handleFullscreenChange = () => setIsFullscreen(!!document.fullscreenElement);
        const handleContextMenu = (e: MouseEvent) => e.preventDefault();
        const handleKeyDown = (e: KeyboardEvent) => {
            if ((e.ctrlKey || e.metaKey) && (e.key === 'c' || e.key === 'v' || e.key === 'p' || e.key === 'u')) {
                e.preventDefault();
                toast.error("Security Restriction: Copy/Paste/Print disabled.");
            }
        };
        const handleOnline = () => setIsOnline(true);
        const handleOffline = () => {
            setIsOnline(false);
            toast.error("Connection Lost! Progress is saved locally.", { duration: Infinity, id: 'offline' });
        };

        document.addEventListener('visibilitychange', handleVisibilityChange);
        document.addEventListener('fullscreenchange', handleFullscreenChange);
        document.addEventListener('contextmenu', handleContextMenu);
        document.addEventListener('keydown', handleKeyDown);
        window.addEventListener('online', handleOnline);
        window.addEventListener('offline', handleOffline);
        
        return () => {
            document.removeEventListener('visibilitychange', handleVisibilityChange);
            document.removeEventListener('fullscreenchange', handleFullscreenChange);
            document.removeEventListener('contextmenu', handleContextMenu);
            document.removeEventListener('keydown', handleKeyDown);
            window.removeEventListener('online', handleOnline);
            window.removeEventListener('offline', handleOffline);
            if (tickInterval.current) clearInterval(tickInterval.current);
        };
    }, [testData, showInstructions]);

    const requestFullscreen = () => {
        if (document.documentElement.requestFullscreen) {
            document.documentElement.requestFullscreen().catch(() => {});
        }
    };

    const handleOptionSelect = (qId: string, optionHash: string) => {
        setResponses(prev => ({
            ...prev,
            [qId]: { ...prev[qId], selectedOption: optionHash, status: 'ANSWERED' }
        }));
    };

    const handleClearResponse = () => {
        const qId = allQuestions[currentIndex].id;
        setResponses(prev => ({
            ...prev,
            [qId]: { ...prev[qId], selectedOption: null, status: 'NOT_ANSWERED' }
        }));
    };

    const handleMarkForReview = () => {
        const qId = allQuestions[currentIndex].id;
        setResponses(prev => ({
            ...prev,
            [qId]: { 
                ...prev[qId], 
                status: prev[qId].selectedOption ? 'ANSWERED_AND_MARKED' : 'MARKED_FOR_REVIEW' 
            }
        }));
        goToNext();
    };

    const handleSaveAndNext = () => {
        const qId = allQuestions[currentIndex].id;
        const currentRes = responses[qId];
        const finalStatus = currentRes.selectedOption ? 'ANSWERED' : 'NOT_ANSWERED';
        
        setResponses(prev => ({
            ...prev,
            [qId]: { ...prev[qId], status: finalStatus }
        }));
        goToNext();
    };

    const handleSaveAndMarkForReview = () => {
        const qId = allQuestions[currentIndex].id;
        if (!responses[qId].selectedOption) {
            toast.error("Please select an option first");
            return;
        }
        setResponses(prev => ({
            ...prev,
            [qId]: { ...prev[qId], status: 'ANSWERED_AND_MARKED' }
        }));
        goToNext();
    };

    const goToNext = () => {
        if (currentIndex < allQuestions.length - 1) {
            goToQuestion(currentIndex + 1);
        }
    };

    const goToQuestion = (index: number) => {
        if (index >= 0 && index < allQuestions.length) {
            const nextQId = allQuestions[index].id;
            if (responses[nextQId]?.status === 'NOT_VISITED') {
                setResponses(prev => ({
                    ...prev,
                    [nextQId]: { ...prev[nextQId], status: 'NOT_ANSWERED' }
                }));
            }
            setCurrentIndex(index);
            lastSyncTime.current = Date.now();
        }
    };

    const autoSubmitTest = useCallback(async () => {
        if (isSubmitting) return;
        setIsSubmitting(true);
        if (tickInterval.current) clearInterval(tickInterval.current);

        try {
            const res = await fetch(`/api/student/tests/${testId}/submit`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ attemptId, responses })
            });
            const data = await res.json();
            
            localStorage.removeItem(`test_state_${testId}`);
            if (document.fullscreenElement) {
                document.exitFullscreen().catch(()=>{});
            }
            
            if (res.ok) {
                setTestResult(data);
            } else {
                throw new Error(data.error || 'Failed to submit test');
            }
        } catch (error) {
            console.error(error);
            toast.error("Critical submission error. Retrying...");
            setIsSubmitting(false);
        }
    }, [attemptId, responses, testId, isSubmitting]);

    const formatTime = (secs: number) => {
        const h = Math.floor(secs / 3600);
        const m = Math.floor((secs % 3600) / 60);
        const s = secs % 60;
        return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    };

    const getColorForStatus = (status: QuestionStatus) => {
        switch (status) {
            case 'ANSWERED': return 'bg-emerald-500 text-white border-emerald-600 shadow-emerald-200';
            case 'NOT_ANSWERED': return 'bg-rose-500 text-white border-rose-600 shadow-rose-200';
            case 'NOT_VISITED': return 'bg-white text-gray-500 border-gray-200';
            case 'MARKED_FOR_REVIEW': return 'bg-indigo-600 text-white border-indigo-700 shadow-indigo-200';
            case 'ANSWERED_AND_MARKED': return 'bg-indigo-600 text-white border-indigo-700 relative shadow-indigo-200';
            default: return 'bg-white text-gray-500 border-gray-200';
        }
    };

    if (!testData || allQuestions.length === 0) {
        return (
            <div className="h-screen w-full flex flex-col items-center justify-center bg-white">
                <Loader2 className="w-12 h-12 animate-spin text-indigo-600 mb-4" />
                <p className="text-gray-500 font-bold animate-pulse uppercase tracking-[0.2em]">Synchronizing Secure Environment</p>
            </div>
        );
    }

    const currentQ = allQuestions[currentIndex];
    
    // Use clear naming to avoid confusion
    const rawOptions = useMemo(() => {
        if (!currentQ?.options) return [];
        const parsed = typeof currentQ.options === 'string' ? JSON.parse(currentQ.options) : currentQ.options;
        return parsed.map((text: string, idx: number) => ({ text, originalLetter: String.fromCharCode(65 + idx) }));
    }, [currentQ?.id]);

    // Stable Shuffled Options (Client-side only to prevent hydration mismatch)
    const [stableOptions, setStableOptions] = useState<any[]>([]);
    useEffect(() => {
        if (rawOptions.length === 0) {
            setStableOptions([]);
            return;
        }
        const array = [...rawOptions];
        for (let i = array.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [array[i], array[j]] = [array[j], array[i]];
        }
        setStableOptions(array);
    }, [currentQ?.id, rawOptions]);

    return (
        <div className="flex flex-col h-screen bg-[#F8FAFC] font-sans select-none overflow-hidden text-gray-900">
            {/* INSTRUCTIONS OVERLAY */}
            <AnimatePresence>
                {showInstructions && (
                    <motion.div 
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 z-[100] bg-white flex flex-col items-center justify-center p-6"
                    >
                        <div className="max-w-2xl w-full">
                            <div className="text-center mb-10">
                                <div className="w-20 h-20 bg-indigo-50 rounded-3xl flex items-center justify-center mx-auto mb-6">
                                    <BookText className="w-10 h-10 text-indigo-600" />
                                </div>
                                <h2 className="text-3xl font-black mb-2 tracking-tight">Exam Instructions</h2>
                                <p className="text-gray-500 font-bold uppercase text-xs tracking-widest">{testData.title}</p>
                            </div>
                            
                            <div className="bg-gray-50 rounded-3xl p-8 border border-gray-100 space-y-4 mb-10 shadow-sm">
                                <div className="flex gap-4 items-start">
                                    <div className="w-6 h-6 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center text-xs font-black shrink-0">1</div>
                                    <p className="text-sm font-bold text-gray-700 leading-relaxed">This is a STRICT mode exam. Switching tabs or minimizing the browser will lead to automatic disqualification after 3 warnings.</p>
                                </div>
                                <div className="flex gap-4 items-start">
                                    <div className="w-6 h-6 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center text-xs font-black shrink-0">2</div>
                                    <p className="text-sm font-bold text-gray-700 leading-relaxed">Progress is saved locally. If you lose connection, stay on the page; your timer and answers will persist.</p>
                                </div>
                                <div className="flex gap-4 items-start">
                                    <div className="w-6 h-6 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center text-xs font-black shrink-0">3</div>
                                    <p className="text-sm font-bold text-gray-700 leading-relaxed">Ensure you have <strong>{testData.duration} minutes</strong> of uninterrupted time.</p>
                                </div>
                            </div>

                            <button 
                                onClick={handleStartTest}
                                className="w-full bg-indigo-600 text-white font-black py-5 rounded-2xl hover:bg-indigo-700 transition shadow-xl shadow-indigo-100 flex items-center justify-center gap-3 text-lg uppercase tracking-widest"
                            >
                                <PlayCircle className="w-6 h-6" /> Start Examination
                            </button>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* TOP HEADER */}
            <header className="bg-white border-b border-slate-200 px-6 py-4 flex justify-between items-center z-50 shrink-0">
                <div className="flex items-center gap-4">
                    <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center shadow-lg shadow-indigo-100">
                        <Activity className="w-5 h-5 text-white" />
                    </div>
                    <div>
                        <h1 className="font-black text-lg tracking-tight text-slate-900 leading-none">{testData.title}</h1>
                        <div className="flex items-center gap-2 mt-1.5">
                            <span className="text-[10px] font-black uppercase text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded tracking-tighter">Section {currentIndex + 1} of {allQuestions.length}</span>
                            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">&bull; ID: {testId.slice(-6)}</span>
                        </div>
                    </div>
                </div>
                
                <div className="flex items-center gap-6">
                    <div className="flex items-center gap-3 bg-slate-50 border border-slate-200 pl-4 pr-1 py-1 rounded-2xl">
                        <div className="flex flex-col items-end">
                            <span className="text-[10px] font-black text-slate-400 uppercase tracking-tighter">Time Left</span>
                            <span className={`text-xl font-black font-mono leading-none ${timeLeftRemaining < 300 ? 'text-rose-600 animate-pulse' : 'text-slate-900'}`}>
                                {formatTime(timeLeftRemaining)}
                            </span>
                        </div>
                        <div className={`p-3 rounded-xl ${timeLeftRemaining < 300 ? 'bg-rose-600' : 'bg-slate-900'} text-white shadow-lg`}>
                            <Clock className="w-5 h-5" />
                        </div>
                    </div>
                </div>
            </header>

            {/* SECTION TABS (NTA Style) */}
            <div className="bg-[#E2E8F0] px-6 py-2 flex items-center gap-1 border-b border-slate-300">
                {testData.sections.map((section: any) => {
                    const isActive = activeSectionId === section.id;
                    return (
                        <button
                            key={section.id}
                            onClick={() => {
                                const firstQIndex = allQuestions.findIndex(q => section.questions.some((sq: any) => sq.questionId === q.id));
                                if (firstQIndex !== -1) {
                                    setActiveSectionId(section.id);
                                    goToQuestion(firstQIndex);
                                }
                            }}
                            className={`px-6 py-2 rounded-t-lg font-black text-xs uppercase tracking-widest transition-all ${
                                isActive 
                                    ? 'bg-white text-indigo-700 shadow-[0_-4px_0_0_rgba(79,70,229,1)]' 
                                    : 'text-slate-500 hover:bg-slate-200'
                            }`}
                        >
                            {section.title}
                        </button>
                    );
                })}
            </div>

            {/* MAIN LAYOUT */}
            <main className="flex flex-1 overflow-hidden">
                
                {/* QUESTION CANVAS (Scrollable) */}
                <div className="flex-1 flex flex-col bg-white overflow-hidden border-r border-slate-200">
                    <div className="px-8 py-4 bg-slate-50/50 border-b border-slate-100 flex justify-between items-center shrink-0">
                        <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-lg bg-indigo-900 text-white flex items-center justify-center font-black text-sm">
                                {currentIndex + 1}
                            </div>
                            <span className="text-sm font-bold text-slate-700">Question Item</span>
                        </div>
                        <div className="flex items-center gap-2">
                            <button className="p-2 text-slate-400 hover:bg-slate-200 rounded-lg transition"><Info className="w-4 h-4" /></button>
                        </div>
                    </div>

                    <div className="p-10 overflow-y-auto flex-1 custom-scrollbar">
                        <AnimatePresence mode="wait">
                            <motion.div
                                key={currentQ.id}
                                initial={{ opacity: 0, x: 20 }}
                                animate={{ opacity: 1, x: 0 }}
                                exit={{ opacity: 0, x: -20 }}
                                transition={{ duration: 0.2 }}
                                className="max-w-4xl mx-auto"
                            >
                                <div className="text-xl font-bold text-slate-900 leading-relaxed mb-12">
                                    <MathRenderer content={currentQ.content} />
                                </div>

                                <div className="grid grid-cols-1 gap-4">
                                    {stableOptions.map((optObj: any, idx: number) => {
                                        const displayLetter = String.fromCharCode(65 + idx);
                                        const isSelected = responses[currentQ.id]?.selectedOption === optObj.originalLetter;
                                        return (
                                            <motion.div 
                                                key={idx}
                                                whileHover={{ scale: 1.01 }}
                                                whileTap={{ scale: 0.99 }}
                                                onClick={() => handleOptionSelect(currentQ.id, optObj.originalLetter)}
                                                className={`group flex items-center gap-6 p-5 rounded-2xl border-2 transition-all cursor-pointer shadow-sm ${
                                                    isSelected 
                                                        ? 'border-indigo-600 bg-indigo-50/30' 
                                                        : 'border-slate-100 hover:border-indigo-300 hover:bg-slate-50/50'
                                                }`}
                                            >
                                                <div className={`shrink-0 w-10 h-10 rounded-xl border-2 flex items-center justify-center font-black text-sm transition-colors ${
                                                    isSelected 
                                                        ? 'border-indigo-600 bg-indigo-600 text-white shadow-lg shadow-indigo-100' 
                                                        : 'border-slate-200 bg-white text-slate-400 group-hover:border-indigo-300 group-hover:text-indigo-600'
                                                }`}>
                                                    {displayLetter}
                                                </div>
                                                <div className="text-lg font-bold text-slate-700">
                                                    <MathRenderer content={optObj.text} />
                                                </div>
                                            </motion.div>
                                        );
                                    })}
                                </div>
                            </motion.div>
                        </AnimatePresence>
                    </div>

                    {/* BOTTOM NAV BAR */}
                    <div className="bg-white p-6 border-t border-slate-200 flex flex-wrap justify-between items-center gap-4 shrink-0">
                        <div className="flex gap-4">
                            <button 
                                onClick={handleMarkForReview}
                                className="px-6 py-3 rounded-xl font-black text-xs uppercase tracking-widest transition-all bg-indigo-50 text-indigo-700 hover:bg-indigo-100 flex items-center gap-2 border border-indigo-200 shadow-sm"
                            >
                                <Flag className="w-4 h-4" /> Mark for Review & Next
                            </button>
                            <button 
                                onClick={handleSaveAndMarkForReview}
                                className="px-6 py-3 rounded-xl font-black text-xs uppercase tracking-widest transition-all bg-emerald-50 text-emerald-700 hover:bg-emerald-100 flex items-center gap-2 border border-emerald-200 shadow-sm"
                            >
                                <CheckCircle className="w-4 h-4" /> Save & Mark for Review
                            </button>
                            <button 
                                onClick={handleClearResponse}
                                className="px-6 py-3 rounded-xl font-black text-xs uppercase tracking-widest transition-all text-slate-500 hover:bg-slate-50 flex items-center gap-2 border border-slate-200"
                            >
                                <XCircle className="w-4 h-4" /> Clear Response
                            </button>
                        </div>
                        
                        <div className="flex gap-4">
                            <button 
                                onClick={() => goToQuestion(currentIndex - 1)} 
                                disabled={currentIndex === 0}
                                className="px-8 py-3 rounded-xl font-black text-xs uppercase tracking-widest transition-all border-2 border-slate-200 text-slate-400 hover:bg-slate-50 disabled:opacity-30 disabled:hover:bg-transparent"
                            >
                                Previous
                            </button>
                            <button 
                                onClick={handleSaveAndNext}
                                className="px-10 py-3 rounded-xl font-black text-xs uppercase tracking-widest transition-all bg-slate-900 text-white hover:bg-slate-800 shadow-xl shadow-slate-200 flex items-center gap-2"
                            >
                                {currentIndex === allQuestions.length - 1 ? 'Finish Section' : 'Save & Continue'}
                                <ChevronRight className="w-4 h-4" />
                            </button>
                        </div>
                    </div>
                </div>

                {/* SIDE PALETTE */}
                <aside className="w-[380px] bg-slate-50 flex flex-col shrink-0 border-l border-slate-200 relative">
                    <div className="p-8 border-b border-slate-200 bg-white">
                        <div className="flex items-center justify-between mb-8">
                            <h3 className="font-black text-slate-400 text-[10px] tracking-[0.2em] uppercase">Status Palette</h3>
                            <button className="text-[10px] font-black text-indigo-600 hover:underline">Full Overview</button>
                        </div>
                        
                        <div className="grid grid-cols-2 gap-y-3 gap-x-6 text-[10px] font-black text-slate-500 uppercase tracking-tighter">
                            <div className="flex items-center gap-2.5"><div className="w-4 h-4 rounded-md bg-emerald-500 shadow-lg shadow-emerald-100"></div> Solved</div>
                            <div className="flex items-center gap-2.5"><div className="w-4 h-4 rounded-md bg-rose-500 shadow-lg shadow-rose-100"></div> Skipped</div>
                            <div className="flex items-center gap-2.5"><div className="w-4 h-4 rounded-md bg-white border-2 border-slate-200"></div> Untouched</div>
                            <div className="flex items-center gap-2.5"><div className="w-4 h-4 rounded-md bg-indigo-600 shadow-lg shadow-indigo-100"></div> Review</div>
                        </div>
                    </div>

                    <div className="flex-1 overflow-y-auto p-8 custom-scrollbar">
                        <div className="grid grid-cols-4 gap-3">
                            {allQuestions.map((q, idx) => {
                                const status = responses[q.id]?.status || 'NOT_VISITED';
                                const colorClass = getColorForStatus(status);
                                const isCurrent = currentIndex === idx;
                                return (
                                    <button 
                                        key={q.id}
                                        onClick={() => goToQuestion(idx)}
                                        className={`w-full aspect-square rounded-xl border-2 font-black text-xs transition-all flex items-center justify-center shadow-sm hover:scale-105 ${colorClass} ${
                                            isCurrent ? 'ring-2 ring-offset-4 ring-indigo-600 scale-110 shadow-xl' : 'border-opacity-50'
                                        }`}
                                    >
                                        {idx + 1}
                                        {status === 'ANSWERED_AND_MARKED' && (
                                            <div className="absolute w-2 h-2 rounded-full bg-emerald-400 bottom-1 right-1 border-2 border-white"></div>
                                        )}
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    <div className="p-8 bg-white border-t border-slate-200">
                        <button 
                            onClick={() => {
                                if(confirm("Are you sure you want to finalize and submit? You cannot change your answers after submission.")) {
                                    autoSubmitTest();
                                }
                            }} 
                            disabled={isSubmitting}
                            className="w-full bg-rose-600 text-white font-black py-5 rounded-2xl hover:bg-rose-700 transition-all shadow-xl shadow-rose-100 flex items-center justify-center gap-3 text-sm uppercase tracking-widest disabled:opacity-50"
                        >
                            {isSubmitting ? <Loader2 className="w-5 h-5 animate-spin" /> : <ShieldAlert className="w-5 h-5" />}
                            Terminate & Submit
                        </button>
                    </div>
                </aside>
            </main>

            {/* EXIT FULLSCREEN WARNING */}
            {!isFullscreen && !showInstructions && !testResult && (
                <div className="fixed inset-0 z-[200] bg-slate-900/90 backdrop-blur-md flex items-center justify-center p-6 text-center">
                    <div className="max-w-md">
                        <ShieldAlert className="w-20 h-20 text-rose-500 mx-auto mb-6" />
                        <h2 className="text-2xl font-black text-white mb-2">Security Violation Detection</h2>
                        <p className="text-slate-400 font-bold text-sm mb-8 leading-relaxed">The examination environment MUST stay in fullscreen mode. Continuing outside fullscreen will trigger automatic termination.</p>
                        <button 
                            onClick={requestFullscreen}
                            className="bg-white text-slate-900 font-black px-10 py-4 rounded-2xl hover:bg-slate-100 transition shadow-2xl uppercase tracking-widest text-sm"
                        >
                            Re-enter Lockdown Mode
                        </button>
                    </div>
                </div>
            )}

            {/* RESULTS OVERLAY */}
            {testResult && (
                <div className="fixed inset-0 z-[300] bg-[#0F172A]/95 backdrop-blur-xl flex items-center justify-center p-6">
                    <div className="bg-white rounded-[40px] max-w-lg w-full p-12 text-center shadow-2xl relative overflow-hidden">
                        <div className="absolute top-0 inset-x-0 h-2 bg-gradient-to-r from-indigo-500 via-purple-500 to-rose-500"></div>
                        <div className="w-24 h-24 bg-emerald-50 rounded-[30px] flex items-center justify-center mx-auto mb-8 shadow-inner">
                            <CheckCircle className="w-12 h-12 text-emerald-600" />
                        </div>
                        <h2 className="text-4xl font-black text-slate-900 mb-2 tracking-tight">Submission Finalized</h2>
                        <p className="text-slate-400 font-bold uppercase text-[10px] tracking-[0.3em] mb-10">Preliminary Performance Vectors</p>
                        
                        <div className="grid grid-cols-2 gap-4 mb-10">
                            <div className="bg-slate-50 rounded-3xl p-6 border border-slate-100">
                                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Accuracy Rate</p>
                                <p className="text-4xl font-black text-indigo-600">{testResult.totalCorrect + testResult.totalIncorrect > 0 ? Math.round((testResult.totalCorrect / (testResult.totalCorrect + testResult.totalIncorrect)) * 100) : 0}%</p>
                            </div>
                            <div className="bg-slate-50 rounded-3xl p-6 border border-slate-100">
                                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Net Score</p>
                                <p className="text-4xl font-black text-emerald-600">{testResult.totalScore}</p>
                            </div>
                        </div>

                        <button 
                            onClick={() => router.push('/student/dashboard')}
                            className="w-full bg-slate-900 text-white font-black py-5 rounded-[20px] hover:bg-slate-800 transition shadow-xl shadow-slate-200 text-sm uppercase tracking-[0.2em]"
                        >
                            Return to Command Center
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}
