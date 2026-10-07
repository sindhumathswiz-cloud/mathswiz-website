'use client';

import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { useSession } from 'next-auth/react';
import MathRenderer from '@/components/MathRenderer';
import QuestionTags from '@/components/QuestionTags';
import ExamInstructions from '@/components/exam/ExamInstructions';
import ExamPalette from '@/components/exam/ExamPalette';
import SubmitSummary from '@/components/exam/SubmitSummary';
import { findExamPattern, markingLabel } from '@/lib/exam-patterns';
import { isAnswered } from '@/lib/exam-scoring';
import { MAX_IMAGES_PER_ANSWER } from '@/lib/answer-images';
import { downscalePhoto } from '@/lib/image-downscale';
import {
    alternativePositions, attemptedIn, buildExamSections, canAnswer, examMaxFromSections, instructionRows, isNumericalType, isWrittenType,
    questionTypeLabel, sectionIndexOf, stableShuffle, summaryRows, type ExamResponse, type ExamSection,
} from '@/lib/exam-view';
import {
    ChevronRight,
    Flag,
    Loader2,
    CheckCircle,
    Clock,
    XCircle,
    Activity,
    LayoutGrid,
    ShieldAlert,
    Delete,
    Camera,
    Trash2,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import toast from 'react-hot-toast';

interface TestQuestion {
    id: string;
    content: string;
    options: any;
    type: string;
    difficulty?: string;
    subject?: string;
    class?: string;
    tags?: string[];
}

type Responses = Record<string, ExamResponse>;

const emptyResponses = (questions: TestQuestion[]): Responses => {
    const initial: Responses = {};
    questions.forEach((q, i) => { initial[q.id] = { selectedOption: null, status: i === 0 ? 'NOT_ANSWERED' : 'NOT_VISITED', timeSpent: 0 }; });
    return initial;
};

const NUMERIC_KEYS = ['7', '8', '9', '4', '5', '6', '1', '2', '3', '0', '.', '-'];
const MAX_AUTO_SUBMIT_RETRIES = 5;

export default function TestTakingUI() {
    const { status: authStatus } = useSession();
    const router = useRouter();
    const params = useParams();
    const testId = params.id as string;

    const [testData, setTestData] = useState<any>(null);
    const [attemptId, setAttemptId] = useState<string>('');
    const [allQuestions, setAllQuestions] = useState<TestQuestion[]>([]);

    // Core state
    const [currentIndex, setCurrentIndex] = useState(0);
    const [responses, setResponses] = useState<Responses>({});
    const [timeLeftRemaining, setTimeLeftRemaining] = useState<number>(3600);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isFullscreen, setIsFullscreen] = useState(false);
    const [testResult, setTestResult] = useState<any>(null);
    const [showInstructions, setShowInstructions] = useState(true);
    const [showSummary, setShowSummary] = useState(false);
    const [showPalette, setShowPalette] = useState(false);

    // The latest values, for the timer, the tab-switch handler and the auto-submit.
    // Those callbacks are created once and live for the whole exam; reading state
    // through a closure froze it at the moment the exam started, so an automatic
    // submit sent a blank paper and every second was charged to question 1.
    const responsesRef = useRef<Responses>({});
    responsesRef.current = responses;
    const currentIndexRef = useRef(0);
    currentIndexRef.current = currentIndex;
    const questionsRef = useRef<TestQuestion[]>([]);
    questionsRef.current = allQuestions;
    const attemptIdRef = useRef('');
    attemptIdRef.current = attemptId;
    const modeRef = useRef('STRICT');
    modeRef.current = testData?.mode ?? 'STRICT';

    const tickInterval = useRef<ReturnType<typeof setInterval> | undefined>(undefined);
    const endAtRef = useRef<number>(0);
    const lastSyncTime = useRef(Date.now());
    const submitInFlight = useRef(false);
    const initStarted = useRef(false);
    const saveProgressRef = useRef<(keepalive?: boolean) => Promise<void>>(async () => {});
    const warningsRef = useRef(0);
    const showInstructionsRef = useRef(true);
    showInstructionsRef.current = showInstructions;

    const sections: ExamSection[] = useMemo(() => buildExamSections(testData?.sections ?? []), [testData]);
    const activeSectionIndex = sectionIndexOf(sections, currentIndex);
    const activeSection = sections[activeSectionIndex];
    const strict = testData?.mode === 'STRICT';

    // ---- submit -----------------------------------------------------------
    const submitExam = useCallback(async (auto = false, attempt = 0): Promise<void> => {
        if (submitInFlight.current && attempt === 0) return;
        submitInFlight.current = true;
        setIsSubmitting(true);
        setShowSummary(false);
        if (tickInterval.current) clearInterval(tickInterval.current);

        try {
            const res = await fetch(`/api/student/tests/${testId}/submit`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                // The answers as they are now, not as they were when the exam began.
                body: JSON.stringify({ attemptId: attemptIdRef.current, responses: responsesRef.current }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Failed to submit test');

            localStorage.removeItem(`test_state_${testId}`);
            if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
            setTestResult(data);
        } catch (error) {
            console.error(error);
            // A timed-out or violation submit must not be lost to a flaky connection.
            if (auto && attempt < MAX_AUTO_SUBMIT_RETRIES) {
                toast.error('Could not submit yet. Retrying…', { id: 'submit-retry' });
                setTimeout(() => { void submitExam(true, attempt + 1); }, 3000);
                return;
            }
            toast.error('Submission failed. Check your connection and submit again.');
            submitInFlight.current = false;
            setIsSubmitting(false);
        }
    }, [testId]);
    const submitRef = useRef(submitExam);
    submitRef.current = submitExam;

    // ---- timer ------------------------------------------------------------
    const startTimer = (secondsLeft: number) => {
        if (tickInterval.current) clearInterval(tickInterval.current);
        // A deadline, not a countdown of ticks: a throttled background tab cannot make the clock run slow.
        endAtRef.current = Date.now() + secondsLeft * 1000;
        lastSyncTime.current = Date.now();
        tickInterval.current = setInterval(() => {
            const remaining = Math.max(0, Math.ceil((endAtRef.current - Date.now()) / 1000));
            setTimeLeftRemaining(remaining);

            const now = Date.now();
            const delta = Math.floor((now - lastSyncTime.current) / 1000);
            if (delta >= 1) {
                const qId = questionsRef.current[currentIndexRef.current]?.id;
                if (qId) {
                    setResponses(prev => prev[qId] ? { ...prev, [qId]: { ...prev[qId], timeSpent: (prev[qId].timeSpent || 0) + delta } } : prev);
                }
                lastSyncTime.current = now;
            }

            if (remaining <= 0) {
                if (tickInterval.current) clearInterval(tickInterval.current);
                void submitRef.current(true);
            }
        }, 1000);
    };

    // ---- loading ----------------------------------------------------------
    useEffect(() => {
        if (authStatus === 'unauthenticated') router.push('/');
        // Once only: a second concurrent start would find the first one's saved state and
        // wrongly resume it, skipping the instructions with the clock already running.
        if (authStatus === 'authenticated' && testId && !testData && !initStarted.current) { initStarted.current = true; void initTest(); }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [authStatus, testId]);

    const initTest = async () => {
        try {
            const res = await fetch(`/api/student/tests/${testId}/start`);
            if (!res.ok) throw new Error('Test could not be loaded');
            const data = await res.json();

            setTestData(data.test);
            setAttemptId(data.attempt.id);

            const flattened: TestQuestion[] = [];
            data.test.sections.forEach((sec: any) => sec.questions.forEach((q: any) => flattened.push(q.question)));
            setAllQuestions(flattened);

            const saved = localStorage.getItem(`test_state_${testId}`);
            const parsed = saved ? JSON.parse(saved) : null;
            // The server decides whether the clock has started and how much is left. The old approach of
            // restoring "time left" from this browser let a closed tab pause the clock.
            if (typeof data.secondsRemaining === 'number') {
                const local = parsed && parsed.attemptId === data.attempt.id ? parsed.responses : null;
                setResponses(local ?? data.attempt.savedResponses ?? emptyResponses(flattened));
                setTimeLeftRemaining(data.secondsRemaining);
                setShowInstructions(false);
                startTimer(data.secondsRemaining);
                if (data.test.mode === 'STRICT') requestFullscreen();
            } else {
                setResponses(emptyResponses(flattened));
                setTimeLeftRemaining(data.test.duration * 60);
            }
        } catch (error) {
            console.error('Failed to start test:', error);
            toast.error('Error initiating test. It might be finished or unavailable.');
            router.push('/student/dashboard');
        }
    };

    const requestFullscreen = () => {
        if (document.documentElement.requestFullscreen) document.documentElement.requestFullscreen().catch(() => {});
    };

    const handleStartTest = async () => {
        // The clock starts on the server; the browser only shows what the server says is left.
        try {
            const res = await fetch(`/api/student/tests/${testId}/begin`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ attemptId: attemptIdRef.current }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Could not start');
            setTimeLeftRemaining(data.secondsRemaining);
            setShowInstructions(false);
            startTimer(data.secondsRemaining);
            if (strict) requestFullscreen();
        } catch (error) {
            console.error(error);
            toast.error('Could not start the exam. Check your connection and try again.');
        }
    };

    // Answers are copied to the server while the clock runs, so a late submit is scored from what
    // was given in time, and the paper can be picked up on another device.
    const lastSavedJson = useRef('');
    const progressStopped = useRef(false);
    const saveProgress = useCallback(async (keepalive = false) => {
        if (progressStopped.current || !attemptIdRef.current || showInstructionsRef.current || submitInFlight.current) return;
        const json = JSON.stringify(responsesRef.current);
        if (json === lastSavedJson.current) return;
        try {
            const res = await fetch(`/api/student/tests/${testId}/progress`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ attemptId: attemptIdRef.current, responses: responsesRef.current }),
                keepalive,
            });
            if (res.status === 409) progressStopped.current = true;
            else if (res.ok) lastSavedJson.current = json;
        } catch { /* offline: the next tick tries again, and this device still has its own copy */ }
    }, [testId]);
    saveProgressRef.current = saveProgress;
    useEffect(() => {
        const interval = setInterval(() => { void saveProgress(); }, 8000);
        return () => clearInterval(interval);
    }, [saveProgress]);

    // Keep progress on this device in case the connection or the tab is lost.
    useEffect(() => {
        if (allQuestions.length > 0 && attemptId) {
            localStorage.setItem(`test_state_${testId}`, JSON.stringify({ responses, timeLeft: timeLeftRemaining, attemptId }));
        }
    }, [responses, timeLeftRemaining, testId, allQuestions, attemptId]);

    // ---- exam security (strict mode only) ----------------------------------
    useEffect(() => {
        const handleVisibilityChange = () => {
            if (document.hidden) void saveProgressRef.current(true);
            if (document.hidden && modeRef.current === 'STRICT' && !showInstructionsRef.current && !submitInFlight.current) {
                warningsRef.current += 1;
                if (warningsRef.current < 3) toast.error(`WARNING ${warningsRef.current}/3: Do not leave the test environment!`, { duration: 5000 });
                else void submitRef.current(true);
            }
        };
        const handleFullscreenChange = () => setIsFullscreen(!!document.fullscreenElement);
        const handleContextMenu = (e: MouseEvent) => { if (modeRef.current === 'STRICT') e.preventDefault(); };
        const handleKeyDown = (e: KeyboardEvent) => {
            if (modeRef.current === 'STRICT' && (e.ctrlKey || e.metaKey) && ['c', 'v', 'p', 'u'].includes(e.key)) {
                e.preventDefault();
                toast.error('Security Restriction: Copy/Paste/Print disabled.');
            }
        };
        const handleOffline = () => toast.error('Connection lost. Your progress is saved on this device.', { duration: Infinity, id: 'offline' });
        const handleOnline = () => toast.dismiss('offline');

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
    }, []);

    // ---- answering ---------------------------------------------------------
    const setAnswer = (qId: string, value: string | null, status: ExamResponse['status']) => {
        setResponses(prev => ({ ...prev, [qId]: { ...prev[qId], selectedOption: value, status } }));
    };

    // Refuses (with a message) an answer that would go over the section's limit.
    const allowedToAnswer = (qId: string): boolean => {
        if (!activeSection) return true;
        const check = canAnswer(activeSection, responses, qId);
        if (!check.ok) { toast.error(check.reason, { id: 'attempt-limit', duration: 5000 }); return false; }
        return true;
    };

    const handleOptionSelect = (qId: string, optionLetter: string) => {
        if (!allowedToAnswer(qId)) return;
        setAnswer(qId, optionLetter, 'ANSWERED');
    };

    const handleNumericChange = (qId: string, raw: string) => {
        const cleaned = raw.replace(/[^0-9.\-]/g, '').slice(0, 14);
        if (cleaned === '') { setAnswer(qId, null, 'NOT_ANSWERED'); return; }
        if (!allowedToAnswer(qId)) return;
        setAnswer(qId, cleaned, 'ANSWERED');
    };

    const handleWrittenChange = (qId: string, text: string) => {
        const hasText = text.trim() !== '';
        // The first characters are an "answer" and so must respect internal choice and attempt limits.
        if (hasText && !allowedToAnswer(qId)) return;
        setResponses(prev => {
            const current = prev[qId];
            const answered = hasText || (current?.subjectiveImages?.length ?? 0) > 0;
            return { ...prev, [qId]: { ...current, subjectiveText: text.slice(0, 20_000), status: answered ? 'ANSWERED' : 'NOT_ANSWERED' } };
        });
    };

    // Photos of handwritten working, for written answers.
    const [uploadingPhoto, setUploadingPhoto] = useState(false);
    const attachPhoto = async (qId: string, file: File | undefined) => {
        if (!file || uploadingPhoto) return;
        if ((responses[qId]?.subjectiveImages?.length ?? 0) >= MAX_IMAGES_PER_ANSWER) {
            toast.error(`You can attach up to ${MAX_IMAGES_PER_ANSWER} photos to an answer.`);
            return;
        }
        if (!allowedToAnswer(qId)) return;
        setUploadingPhoto(true);
        try {
            const photo = await downscalePhoto(file);
            const form = new FormData();
            form.set('attemptId', attemptIdRef.current);
            form.set('questionId', qId);
            form.set('file', photo);
            const res = await fetch(`/api/student/tests/${testId}/answer-images`, { method: 'POST', body: form });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(data.error || 'The photo could not be uploaded');
            setResponses(prev => {
                const current = prev[qId];
                return { ...prev, [qId]: { ...current, subjectiveImages: [...(current?.subjectiveImages ?? []), data.id as string], status: 'ANSWERED' } };
            });
        } catch (error) {
            toast.error(error instanceof Error ? error.message : 'The photo could not be uploaded');
        } finally {
            setUploadingPhoto(false);
        }
    };

    const removePhoto = async (qId: string, imageId: string) => {
        try {
            const res = await fetch(`/api/student/tests/${testId}/answer-images/${imageId}`, { method: 'DELETE' });
            if (!res.ok && res.status !== 404) throw new Error('The photo could not be removed');
            setResponses(prev => {
                const current = prev[qId];
                const images = (current?.subjectiveImages ?? []).filter(id => id !== imageId);
                const answered = images.length > 0 || (current?.subjectiveText ?? '').trim() !== '';
                return { ...prev, [qId]: { ...current, subjectiveImages: images, status: answered ? 'ANSWERED' : 'NOT_ANSWERED' } };
            });
        } catch (error) {
            toast.error(error instanceof Error ? error.message : 'The photo could not be removed');
        }
    };

    const handleKeypad = (qId: string, key: string) => handleNumericChange(qId, `${responses[qId]?.selectedOption ?? ''}${key}`);
    const handleBackspace = (qId: string) => handleNumericChange(qId, String(responses[qId]?.selectedOption ?? '').slice(0, -1));

    const currentQ = allQuestions[currentIndex];

    const handleClearResponse = () => {
        if (!currentQ) return;
        setResponses(prev => ({ ...prev, [currentQ.id]: { ...prev[currentQ.id], selectedOption: null, subjectiveText: '', subjectiveImages: [], status: 'NOT_ANSWERED' } }));
    };

    const goToQuestion = (index: number) => {
        if (index < 0 || index >= allQuestions.length) return;
        const nextId = allQuestions[index].id;
        if (responses[nextId]?.status === 'NOT_VISITED') setAnswer(nextId, null, 'NOT_ANSWERED');
        setCurrentIndex(index);
        lastSyncTime.current = Date.now();
        setShowPalette(false);
    };

    const goToNext = () => {
        if (currentIndex < allQuestions.length - 1) goToQuestion(currentIndex + 1);
        else setShowSummary(true);
    };

    const handleMarkForReview = () => {
        if (!currentQ) return;
        const answered = isAnswered(responses[currentQ.id]);
        setResponses(prev => ({ ...prev, [currentQ.id]: { ...prev[currentQ.id], status: answered ? 'ANSWERED_AND_MARKED' : 'MARKED_FOR_REVIEW' } }));
        goToNext();
    };

    const handleSaveAndNext = () => {
        if (!currentQ) return;
        const answered = isAnswered(responses[currentQ.id]);
        setResponses(prev => ({ ...prev, [currentQ.id]: { ...prev[currentQ.id], status: answered ? 'ANSWERED' : 'NOT_ANSWERED' } }));
        goToNext();
    };

    const handleSaveAndMarkForReview = () => {
        if (!currentQ) return;
        if (!isAnswered(responses[currentQ.id])) { toast.error('Please give an answer first'); return; }
        setResponses(prev => ({ ...prev, [currentQ.id]: { ...prev[currentQ.id], status: 'ANSWERED_AND_MARKED' } }));
        goToNext();
    };

    const formatTime = (secs: number) => {
        const h = Math.floor(secs / 3600);
        const m = Math.floor((secs % 3600) / 60);
        const s = secs % 60;
        return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    };

    // Options keep one order per student and question, however often it is revisited.
    const stableOptions = useMemo(() => {
        if (!currentQ?.options) return [];
        const parsed = typeof currentQ.options === 'string' ? JSON.parse(currentQ.options) : currentQ.options;
        if (!Array.isArray(parsed)) return [];
        const withLetters = parsed.map((text: string, idx: number) => ({ text, originalLetter: String.fromCharCode(65 + idx) }));
        return stableShuffle(withLetters, `${attemptId}:${currentQ.id}`);
    }, [currentQ?.id, currentQ?.options, attemptId]);

    const instructionData = useMemo(() => ({
        rows: instructionRows(sections),
        maxMarks: examMaxFromSections(sections),
        written: allQuestions.filter(q => isWrittenType(q.type)).length,
    }), [sections, allQuestions]);

    if (!testData || allQuestions.length === 0 || !currentQ || !activeSection) {
        return (
            <div className="h-screen w-full flex flex-col items-center justify-center bg-white dark:bg-background">
                <Loader2 className="w-12 h-12 animate-spin text-indigo-600 dark:text-brand mb-4" />
                <p className="text-gray-500 dark:text-slate-400 font-bold animate-pulse uppercase tracking-[0.2em]">Synchronizing Secure Environment</p>
            </div>
        );
    }

    const pattern = findExamPattern(testData.examPattern);
    const positionInSection = currentIndex - activeSection.startIndex + 1;
    const attempted = attemptedIn(activeSection, responses);
    const isLastQuestion = currentIndex === allQuestions.length - 1;
    const numerical = isNumericalType(currentQ.type);
    const written = isWrittenType(currentQ.type);
    const alternatives = alternativePositions(activeSection, currentQ.id);
    const numericValue = String(responses[currentQ.id]?.selectedOption ?? '');

    // A full-screen layer above the student layout: its sidebar and links have no place in an exam,
    // and on a phone they would take the whole width.
    return (
        <div className="fixed inset-0 z-[100] flex flex-col bg-[#F8FAFC] dark:bg-background font-sans select-none overflow-hidden text-gray-900 dark:text-foreground">
            {showInstructions && (
                <ExamInstructions
                    title={testData.title}
                    durationMinutes={testData.duration}
                    mode={testData.mode}
                    patternName={pattern?.name ?? null}
                    rows={instructionData.rows}
                    totalQuestions={allQuestions.length}
                    maxMarks={instructionData.maxMarks}
                    writtenQuestions={instructionData.written}
                    onStart={handleStartTest}
                />
            )}

            {/* HEADER */}
            <header className="bg-white dark:bg-surface border-b border-slate-200 dark:border-white/10 px-4 sm:px-6 py-3 flex justify-between items-center gap-4 z-50 shrink-0">
                <div className="flex items-center gap-3 min-w-0">
                    <div className="hidden sm:flex w-10 h-10 bg-indigo-600 rounded-xl items-center justify-center shrink-0"><Activity className="w-5 h-5 text-white" /></div>
                    <div className="min-w-0">
                        <h1 className="font-display font-black text-base sm:text-lg tracking-tight text-slate-900 dark:text-white leading-none truncate">{testData.title}</h1>
                        <p className="mt-1.5 text-[11px] font-bold text-slate-500 dark:text-slate-400 truncate">
                            <span className="uppercase tracking-wider text-indigo-600 dark:text-brand">{activeSection.title}</span>
                            <span className="mx-1.5">·</span>Question {positionInSection} of {activeSection.questionIds.length}
                        </p>
                    </div>
                </div>
                <div className="flex items-center gap-3 bg-slate-50 dark:bg-surface-muted border border-slate-200 dark:border-white/10 pl-4 pr-1 py-1 rounded-2xl shrink-0">
                    <div className="flex flex-col items-end">
                        <span className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-tighter">Time left</span>
                        <span className={`text-lg sm:text-xl font-black font-mono tabular-nums leading-none ${timeLeftRemaining < 300 ? 'text-rose-600 dark:text-rose-400 animate-pulse' : 'text-slate-900 dark:text-white'}`}>{formatTime(timeLeftRemaining)}</span>
                    </div>
                    <div className={`p-3 rounded-xl ${timeLeftRemaining < 300 ? 'bg-rose-600' : 'bg-slate-900 dark:bg-slate-700'} text-white`}><Clock className="w-5 h-5" /></div>
                </div>
            </header>

            {/* SECTION TABS */}
            <nav aria-label="Sections" className="bg-[#E2E8F0] dark:bg-surface-muted px-3 sm:px-6 pt-2 flex items-end gap-1 border-b border-slate-300 dark:border-white/10 overflow-x-auto shrink-0">
                {sections.map((section, i) => {
                    const isActive = i === activeSectionIndex;
                    const done = attemptedIn(section, responses);
                    return (
                        <button
                            key={section.id}
                            type="button"
                            aria-current={isActive ? 'true' : undefined}
                            onClick={() => goToQuestion(section.startIndex)}
                            className={`shrink-0 px-4 sm:px-6 py-2 rounded-t-lg text-left transition-all ${isActive ? 'bg-white dark:bg-surface text-indigo-700 dark:text-brand shadow-[0_-4px_0_0_rgba(79,70,229,1)]' : 'text-slate-500 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-white/5'}`}
                        >
                            <span className="block font-black text-xs uppercase tracking-widest">{section.title}</span>
                            <span className="block text-[10px] font-bold tabular-nums opacity-80">{done}/{section.attemptLimit ?? section.questionIds.length} answered</span>
                        </button>
                    );
                })}
            </nav>

            <main className="flex flex-1 overflow-hidden">
                {/* QUESTION CANVAS */}
                <div className="flex-1 min-w-0 flex flex-col bg-white dark:bg-surface overflow-hidden lg:border-r border-slate-200 dark:border-white/10">
                    <div className="px-4 sm:px-8 py-3 bg-slate-50/60 dark:bg-surface-muted border-b border-slate-100 dark:border-white/10 flex flex-wrap items-center gap-x-3 gap-y-2 shrink-0">
                        <div className="w-8 h-8 rounded-lg bg-indigo-900 text-white flex items-center justify-center font-black text-sm tabular-nums">{positionInSection}</div>
                        <span className="text-xs font-black uppercase tracking-wider text-slate-600 dark:text-slate-300">{questionTypeLabel(currentQ.type)}</span>
                        <span className="rounded-md bg-emerald-50 px-2 py-1 text-[11px] font-black text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400">{markingLabel(activeSection)}</span>
                        {alternatives.length > 0 && (
                            <span data-testid="alternative-note" className="rounded-md bg-violet-50 px-2 py-1 text-[11px] font-black text-violet-700 dark:bg-violet-500/10 dark:text-violet-300">
                                OR: answer this or Question {alternatives.join(' / ')}, not both
                            </span>
                        )}
                        <button type="button" onClick={() => setShowPalette(true)} className="ml-auto flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-1.5 text-[11px] font-black uppercase tracking-wider text-white lg:hidden">
                            <LayoutGrid className="h-3.5 w-3.5" /> Questions
                        </button>
                        {activeSection.attemptLimit !== null && (
                            <span className={`lg:ml-auto rounded-md px-2 py-1 text-[11px] font-black tabular-nums ${attempted >= activeSection.attemptLimit ? 'bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300' : 'bg-indigo-50 text-indigo-700 dark:bg-brand/10 dark:text-brand'}`}>
                                Answered {attempted} of {activeSection.attemptLimit} allowed
                            </span>
                        )}
                    </div>

                    <div className="p-5 sm:p-10 overflow-y-auto flex-1 custom-scrollbar">
                        <AnimatePresence mode="wait">
                            <motion.div key={currentQ.id} initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -16 }} transition={{ duration: 0.15 }} className="max-w-3xl mx-auto">
                                <div className="text-lg sm:text-xl font-bold text-slate-900 dark:text-white leading-relaxed mb-4"><MathRenderer content={currentQ.content} /></div>
                                <QuestionTags tags={currentQ.tags} className="mb-8" />

                                {written ? (
                                    <div>
                                        <label htmlFor="written-answer" className="mb-2 block text-[11px] font-black uppercase tracking-widest text-slate-500 dark:text-slate-400">Your answer</label>
                                        <textarea
                                            id="written-answer"
                                            data-testid="written-answer"
                                            value={responses[currentQ.id]?.subjectiveText ?? ''}
                                            onChange={e => handleWrittenChange(currentQ.id, e.target.value)}
                                            rows={12}
                                            spellCheck={false}
                                            placeholder="Write your working and answer here. Use $...$ for maths if you like."
                                            className="w-full rounded-2xl border-2 border-slate-200 bg-white p-4 text-base font-medium leading-relaxed text-slate-900 outline-none focus:border-indigo-600 dark:border-white/10 dark:bg-surface-muted dark:text-white dark:focus:border-brand"
                                        />
                                        <div className="mt-4">
                                            <div className="flex flex-wrap items-center gap-3">
                                                <label className={`inline-flex cursor-pointer items-center gap-2 rounded-xl border-2 border-dashed border-slate-300 px-4 py-2.5 text-xs font-black uppercase tracking-wider text-slate-600 transition hover:border-indigo-400 hover:text-indigo-700 dark:border-white/20 dark:text-slate-300 ${uploadingPhoto || (responses[currentQ.id]?.subjectiveImages?.length ?? 0) >= MAX_IMAGES_PER_ANSWER ? 'pointer-events-none opacity-50' : ''}`}>
                                                    <Camera className="h-4 w-4" /> {uploadingPhoto ? 'Uploading…' : 'Add a photo of your working'}
                                                    <input
                                                        type="file"
                                                        accept="image/*"
                                                        data-testid="answer-photo-input"
                                                        className="sr-only"
                                                        onChange={e => { const file = e.target.files?.[0]; e.target.value = ''; void attachPhoto(currentQ.id, file); }}
                                                    />
                                                </label>
                                                <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">Up to {MAX_IMAGES_PER_ANSWER} photos. Write clearly and keep the page flat.</span>
                                            </div>
                                            {(responses[currentQ.id]?.subjectiveImages?.length ?? 0) > 0 && (
                                                <ul className="mt-3 flex flex-wrap gap-3" aria-label="Attached photos">
                                                    {responses[currentQ.id]!.subjectiveImages!.map((imageId, i) => (
                                                        <li key={imageId} className="relative">
                                                            {/* eslint-disable-next-line @next/next/no-img-element */}
                                                            <img src={`/api/answer-images/${imageId}`} alt={`Photo ${i + 1} of your working`} data-testid="answer-photo" className="h-24 w-24 rounded-xl border border-slate-200 object-cover dark:border-white/10" />
                                                            <button type="button" onClick={() => void removePhoto(currentQ.id, imageId)} aria-label={`Remove photo ${i + 1}`} className="absolute -right-2 -top-2 rounded-full bg-rose-600 p-1.5 text-white shadow"><Trash2 className="h-3 w-3" /></button>
                                                        </li>
                                                    ))}
                                                </ul>
                                            )}
                                        </div>
                                        <p className="mt-3 text-xs font-semibold text-slate-500 dark:text-slate-400">Your teacher marks this after the exam. Your total is updated when they do.</p>
                                    </div>
                                ) : numerical ? (
                                    <div className="max-w-sm">
                                        <label htmlFor="numeric-answer" className="mb-2 block text-[11px] font-black uppercase tracking-widest text-slate-500 dark:text-slate-400">Your answer</label>
                                        <input
                                            id="numeric-answer"
                                            data-testid="numeric-answer"
                                            type="text"
                                            inputMode="decimal"
                                            autoComplete="off"
                                            value={numericValue}
                                            onChange={e => handleNumericChange(currentQ.id, e.target.value)}
                                            placeholder="Type a number"
                                            className="w-full rounded-2xl border-2 border-slate-200 bg-white px-5 py-4 text-2xl font-black tabular-nums text-slate-900 outline-none focus:border-indigo-600 dark:border-white/10 dark:bg-surface-muted dark:text-white dark:focus:border-brand"
                                        />
                                        <div className="mt-3 grid grid-cols-3 gap-2" role="group" aria-label="Number pad">
                                            {NUMERIC_KEYS.map(key => (
                                                <button key={key} type="button" onClick={() => handleKeypad(currentQ.id, key)} className="rounded-xl border-2 border-slate-200 bg-slate-50 py-3 text-lg font-black text-slate-800 transition hover:bg-slate-100 active:scale-95 dark:border-white/10 dark:bg-surface-muted dark:text-white dark:hover:bg-white/5">{key}</button>
                                            ))}
                                            <button type="button" onClick={() => handleBackspace(currentQ.id)} aria-label="Backspace" className="col-span-2 flex items-center justify-center gap-2 rounded-xl border-2 border-slate-200 bg-slate-50 py-3 text-sm font-black text-slate-700 transition hover:bg-slate-100 dark:border-white/10 dark:bg-surface-muted dark:text-slate-200"><Delete className="h-4 w-4" /> Backspace</button>
                                            <button type="button" onClick={handleClearResponse} className="rounded-xl border-2 border-slate-200 bg-slate-50 py-3 text-sm font-black text-rose-600 transition hover:bg-rose-50 dark:border-white/10 dark:bg-surface-muted">Clear</button>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="grid grid-cols-1 gap-3 sm:gap-4">
                                        {stableOptions.map((optObj: any, idx: number) => {
                                            const displayLetter = String.fromCharCode(65 + idx);
                                            const isSelected = responses[currentQ.id]?.selectedOption === optObj.originalLetter;
                                            return (
                                                <motion.div
                                                    key={optObj.originalLetter}
                                                    data-testid={`option-original-${optObj.originalLetter}`}
                                                    whileTap={{ scale: 0.99 }}
                                                    onClick={() => handleOptionSelect(currentQ.id, optObj.originalLetter)}
                                                    className={`group flex items-center gap-4 sm:gap-6 p-4 sm:p-5 rounded-2xl border-2 transition-all cursor-pointer shadow-sm ${isSelected ? 'border-indigo-600 dark:border-brand bg-indigo-50/40 dark:bg-brand/10' : 'border-slate-100 dark:border-white/10 hover:border-indigo-300 dark:hover:border-brand/50 hover:bg-slate-50/50 dark:hover:bg-white/5'}`}
                                                >
                                                    <div className={`shrink-0 w-9 h-9 sm:w-10 sm:h-10 rounded-xl border-2 flex items-center justify-center font-black text-sm transition-colors ${isSelected ? 'border-indigo-600 dark:border-brand bg-indigo-600 dark:bg-brand text-white' : 'border-slate-200 dark:border-white/10 bg-white dark:bg-surface text-slate-400 dark:text-slate-500'}`}>{displayLetter}</div>
                                                    <div className="text-base sm:text-lg font-bold text-slate-700 dark:text-slate-300 min-w-0"><MathRenderer content={optObj.text} /></div>
                                                </motion.div>
                                            );
                                        })}
                                    </div>
                                )}
                            </motion.div>
                        </AnimatePresence>
                    </div>

                    {/* ACTIONS */}
                    <div className="bg-white dark:bg-surface p-3 sm:p-5 border-t border-slate-200 dark:border-white/10 flex flex-wrap justify-between items-center gap-3 shrink-0">
                        <div className="flex flex-wrap gap-2 sm:gap-3">
                            <button type="button" onClick={handleMarkForReview} className="px-4 sm:px-5 py-2.5 rounded-xl font-black text-[11px] uppercase tracking-wider bg-indigo-50 dark:bg-brand/10 text-indigo-700 dark:text-brand hover:bg-indigo-100 dark:hover:bg-brand/15 flex items-center gap-2 border border-indigo-200 dark:border-brand/30"><Flag className="w-4 h-4" /> Mark for Review &amp; Next</button>
                            <button type="button" onClick={handleSaveAndMarkForReview} className="px-4 sm:px-5 py-2.5 rounded-xl font-black text-[11px] uppercase tracking-wider bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-100 flex items-center gap-2 border border-emerald-200 dark:border-emerald-500/30"><CheckCircle className="w-4 h-4" /> Save &amp; Mark for Review</button>
                            <button type="button" onClick={handleClearResponse} className="px-4 sm:px-5 py-2.5 rounded-xl font-black text-[11px] uppercase tracking-wider text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-white/5 flex items-center gap-2 border border-slate-200 dark:border-white/10"><XCircle className="w-4 h-4" /> Clear Response</button>
                        </div>
                        <div className="flex gap-2 sm:gap-3 ml-auto">
                            <button type="button" onClick={() => goToQuestion(currentIndex - 1)} disabled={currentIndex === 0} className="px-5 sm:px-7 py-2.5 rounded-xl font-black text-[11px] uppercase tracking-wider border-2 border-slate-200 dark:border-white/10 text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-white/5 disabled:opacity-30">Previous</button>
                            <button type="button" onClick={handleSaveAndNext} className="px-6 sm:px-9 py-2.5 rounded-xl font-black text-[11px] uppercase tracking-wider bg-slate-900 dark:bg-slate-700 text-white hover:bg-slate-800 dark:hover:bg-slate-600 flex items-center gap-2">
                                {isLastQuestion ? 'Save & Review' : currentIndex === activeSection.startIndex + activeSection.questionIds.length - 1 ? 'Save & Next Section' : 'Save & Continue'}
                                <ChevronRight className="w-4 h-4" />
                            </button>
                        </div>
                    </div>
                </div>

                {/* PALETTE: a side panel on wide screens, a drawer on narrow ones */}
                <aside className="hidden lg:flex w-[320px] shrink-0 bg-slate-50 dark:bg-surface-muted border-l border-slate-200 dark:border-white/10">
                    <ExamPalette section={activeSection} responses={responses} currentIndex={currentIndex} onGo={goToQuestion} onOverview={() => setShowSummary(true)} onSubmit={() => setShowSummary(true)} submitting={isSubmitting} />
                </aside>
            </main>

            {showPalette && (
                <div className="lg:hidden fixed inset-0 z-[150] flex flex-col justify-end bg-slate-900/60" onClick={() => setShowPalette(false)}>
                    <div className="max-h-[80%] overflow-hidden rounded-t-3xl bg-slate-50 dark:bg-surface-muted" onClick={e => e.stopPropagation()}>
                        <ExamPalette section={activeSection} responses={responses} currentIndex={currentIndex} onGo={goToQuestion} onOverview={() => { setShowPalette(false); setShowSummary(true); }} onSubmit={() => { setShowPalette(false); setShowSummary(true); }} submitting={isSubmitting} />
                    </div>
                </div>
            )}

            {showSummary && !testResult && (
                <SubmitSummary rows={summaryRows(sections, responses)} secondsLeft={timeLeftRemaining} submitting={isSubmitting} onBack={() => setShowSummary(false)} onSubmit={() => void submitExam(false)} />
            )}

            {/* FULLSCREEN (strict mode only) */}
            {strict && !isFullscreen && !showInstructions && !testResult && !isSubmitting && (
                <div className="fixed inset-0 z-[200] bg-slate-900/90 backdrop-blur-md flex items-center justify-center p-6 text-center">
                    <div className="max-w-md">
                        <ShieldAlert className="w-20 h-20 text-rose-500 mx-auto mb-6" />
                        <h2 className="font-display text-2xl font-black text-white mb-2">Full screen required</h2>
                        <p className="text-slate-400 font-bold text-sm mb-8 leading-relaxed">This paper must stay in full screen. Leaving it counts as a warning, and the third warning submits your paper.</p>
                        <button type="button" onClick={requestFullscreen} className="bg-white text-slate-900 font-black px-10 py-4 rounded-2xl hover:bg-slate-100 transition shadow-2xl uppercase tracking-widest text-sm">Return to full screen</button>
                    </div>
                </div>
            )}

            {/* RESULT */}
            {testResult && (
                <div className="fixed inset-0 z-[300] bg-[#0F172A]/95 backdrop-blur-xl flex items-center justify-center p-6">
                    <div className="bg-white dark:bg-surface rounded-[32px] max-w-lg w-full p-8 sm:p-12 text-center shadow-2xl relative overflow-hidden">
                        <div className="absolute top-0 inset-x-0 h-2 bg-gradient-to-r from-indigo-500 via-purple-500 to-rose-500"></div>
                        <div className="w-20 h-20 bg-emerald-50 dark:bg-emerald-500/10 rounded-[26px] flex items-center justify-center mx-auto mb-6"><CheckCircle className="w-10 h-10 text-emerald-600 dark:text-emerald-400" /></div>
                        <h2 className="font-display text-3xl sm:text-4xl font-black text-slate-900 dark:text-white mb-1 tracking-tight">Paper submitted</h2>
                        <p className="text-slate-400 dark:text-slate-500 font-bold uppercase text-[10px] tracking-[0.3em] mb-8">Your score</p>
                        <p className="mb-6 text-5xl font-black tabular-nums text-emerald-600 dark:text-emerald-400">{testResult.totalScore}<span className="text-2xl text-slate-400"> / {instructionData.maxMarks}</span></p>
                        {testResult.pendingReview > 0 && (
                            <p className="-mt-3 mb-6 rounded-xl bg-amber-50 p-3 text-sm font-semibold text-amber-800 dark:bg-amber-500/10 dark:text-amber-300">
                                {testResult.pendingReview} written answer{testResult.pendingReview === 1 ? '' : 's'} will be marked by your teacher. This score does not include {testResult.pendingReview === 1 ? 'it' : 'them'} yet.
                            </p>
                        )}
                        {testResult.scoredFromSavedCopy && (
                            <p className="-mt-3 mb-6 rounded-xl bg-slate-100 p-3 text-sm font-semibold text-slate-700 dark:bg-white/5 dark:text-slate-300">
                                Time had already run out, so this paper was scored from the answers saved before the deadline.
                            </p>
                        )}
                        <dl className="grid grid-cols-3 gap-3 mb-8 text-center">
                            {[['Correct', testResult.totalCorrect], ['Wrong', testResult.totalIncorrect], ['Skipped', testResult.totalSkipped]].map(([label, value]) => (
                                <div key={label as string} className="bg-slate-50 dark:bg-surface-muted rounded-2xl p-4 border border-slate-100 dark:border-white/10">
                                    <dt className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{label}</dt>
                                    <dd className="mt-1 text-2xl font-black tabular-nums text-slate-900 dark:text-white">{value}</dd>
                                </div>
                            ))}
                        </dl>
                        <div className="grid grid-cols-1 gap-3">
                            <button type="button" onClick={() => router.push(`/student/performance/${testResult.id}`)} className="w-full bg-gradient-to-br from-indigo-600 to-violet-600 dark:from-brand dark:to-brand-violet text-white font-black py-4 rounded-2xl hover:opacity-95 transition text-sm uppercase tracking-[0.2em]">View Full Report</button>
                            <button type="button" onClick={() => router.push('/student/dashboard')} className="w-full bg-slate-900 dark:bg-slate-700 text-white font-black py-4 rounded-2xl hover:bg-slate-800 transition text-sm uppercase tracking-[0.2em]">Return to Command Center</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
