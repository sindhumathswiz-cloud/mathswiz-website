'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, BookOpen, CheckCircle2, Clock, Loader2, RotateCcw, Target, Trophy } from 'lucide-react';
import toast from 'react-hot-toast';
import MathRenderer from '@/components/MathRenderer';
import LearningPathQuestionCard from '@/components/LearningPathQuestionCard';
import { readJsonResponse } from '@/lib/http-json';
import { GUIDED_ACCURACY_THRESHOLD, GUIDED_MIN_ATTEMPTS } from '@/lib/learning-path';

type Stage = 'EXAMPLES' | 'GUIDED_PRACTICE' | 'TIMED_QUIZ' | 'RECOVERY_PRACTICE' | 'COMPLETED';

type PathDetail = {
  topic: string;
  stage: Stage;
  examplesRequired: number;
  examplesViewedCount: number;
  examplesViewedIds: string[];
  examples: { id: string; content: string; explanation: string; difficulty: string }[];
  guidedAttempted: number;
  guidedCorrect: number;
  quizScore: number | null;
  recoveryQuestionIds: string[];
};

export default function LearningPathClient({ topicParam }: { topicParam: string }) {
  const topic = decodeURIComponent(topicParam);
  const encodedTopic = encodeURIComponent(topic);
  const [detail, setDetail] = useState<PathDetail | null>(null);
  const [loading, setLoading] = useState(true);

  const load = () => {
    setLoading(true);
    fetch(`/api/student/learning-paths/${encodedTopic}`)
      .then((response) => response.json())
      .then((data) => setDetail(data))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, [encodedTopic]);

  if (loading) return <main className="min-h-screen bg-slate-50 p-10"><Loader2 className="mx-auto my-20 h-8 w-8 animate-spin text-indigo-600" /></main>;
  if (!detail) return <main className="min-h-screen bg-slate-50 p-10"><div className="mx-auto max-w-3xl rounded-3xl border border-dashed bg-white p-16 text-center font-bold text-slate-600">Could not load this path.</div></main>;

  return (
    <main className="min-h-screen bg-slate-50 p-6 md:p-10">
      <div className="mx-auto max-w-3xl">
        <Link href="/student/learning-paths" className="mb-6 inline-flex items-center gap-2 text-sm font-bold text-indigo-700">
          <ArrowLeft className="h-4 w-4" />All learning paths
        </Link>
        <h1 className="mb-1 text-3xl font-black text-slate-900">{topic}</h1>
        <p className="mb-8 text-slate-600">
          {detail.stage === 'EXAMPLES' && 'Step 1 of 4 — worked examples'}
          {detail.stage === 'GUIDED_PRACTICE' && 'Step 2 of 4 — guided practice'}
          {detail.stage === 'TIMED_QUIZ' && 'Step 3 of 4 — timed quiz'}
          {detail.stage === 'RECOVERY_PRACTICE' && 'Step 4 of 4 — recovery practice'}
          {detail.stage === 'COMPLETED' && 'Path complete!'}
        </p>

        {detail.stage === 'EXAMPLES' && <ExamplesStage topic={topic} encodedTopic={encodedTopic} detail={detail} onAdvance={load} />}
        {detail.stage === 'GUIDED_PRACTICE' && <GuidedPracticeStage topic={topic} encodedTopic={encodedTopic} detail={detail} onAdvance={load} />}
        {detail.stage === 'TIMED_QUIZ' && <TimedQuizStage encodedTopic={encodedTopic} onAdvance={load} />}
        {detail.stage === 'RECOVERY_PRACTICE' && <RecoveryStage topic={topic} encodedTopic={encodedTopic} detail={detail} onAdvance={load} />}
        {detail.stage === 'COMPLETED' && <CompletedStage topic={topic} detail={detail} />}
      </div>
    </main>
  );
}

function ExamplesStage({ encodedTopic, detail, onAdvance }: { topic: string; encodedTopic: string; detail: PathDetail; onAdvance: () => void }) {
  const [markingId, setMarkingId] = useState<string | null>(null);

  const markViewed = async (questionId: string) => {
    setMarkingId(questionId);
    try {
      const response = await fetch(`/api/student/learning-paths/${encodedTopic}/examples/view`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ questionId }),
      });
      if (!response.ok) {
        toast.error('Could not record this — try again.');
        return;
      }
      onAdvance();
    } finally {
      setMarkingId(null);
    }
  };

  if (detail.examples.length === 0) {
    return <div className="rounded-3xl border border-dashed bg-white p-16 text-center font-bold text-slate-600">No worked examples available for this topic yet.</div>;
  }

  return (
    <div>
      <div className="mb-6 rounded-2xl bg-indigo-50 p-4 text-sm font-bold text-indigo-700">
        Reviewed {detail.examplesViewedCount} of {detail.examplesRequired} required examples.
      </div>
      <div className="space-y-4">
        {detail.examples.map((ex) => {
          const viewed = detail.examplesViewedIds.includes(ex.id);
          return (
            <div key={ex.id} className={`rounded-2xl border bg-white p-5 ${viewed ? 'border-emerald-300' : ''}`}>
              <div className="mb-3 flex items-center gap-2 text-xs font-black uppercase tracking-wide text-slate-500">
                <BookOpen className="h-4 w-4" />Worked example · {ex.difficulty}
                {viewed && <span className="ml-auto inline-flex items-center gap-1 text-emerald-600"><CheckCircle2 className="h-4 w-4" />Reviewed</span>}
              </div>
              <div className="mb-3 text-sm font-bold text-slate-900"><MathRenderer content={ex.content} /></div>
              <div className="mb-4 rounded-xl bg-slate-50 p-4 text-sm text-slate-700"><MathRenderer content={ex.explanation} /></div>
              {!viewed && (
                <button
                  type="button"
                  onClick={() => markViewed(ex.id)}
                  disabled={markingId === ex.id}
                  className="rounded-xl bg-indigo-600 px-4 py-2 text-xs font-black text-white disabled:opacity-50"
                >
                  {markingId === ex.id ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Mark as reviewed'}
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function GuidedPracticeStage({ topic, encodedTopic, detail, onAdvance }: { topic: string; encodedTopic: string; detail: PathDetail; onAdvance: () => void }) {
  const [question, setQuestion] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [attempted, setAttempted] = useState(detail.guidedAttempted);
  const [correct, setCorrect] = useState(detail.guidedCorrect);

  const fetchNext = () => {
    setLoading(true);
    fetch(`/api/student/practice/next?topic=${encodeURIComponent(topic)}`)
      .then((response) => readJsonResponse<{ question?: any }>(response))
      .then((data) => setQuestion(data?.question ?? null))
      .finally(() => setLoading(false));
  };

  useEffect(() => { fetchNext(); }, [topic]);

  const handleAnswered = async (isCorrect: boolean | null) => {
    if (isCorrect === null) {
      // Skipped (invalid/no-option question) -- carries no correctness
      // signal, matches Practice Arena's own skip semantics: doesn't count
      // toward guided-practice attempts either way.
      fetchNext();
      return;
    }
    const response = await fetch(`/api/student/learning-paths/${encodedTopic}/guided/record`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isCorrect }),
    });
    const data = await readJsonResponse<{ progress?: { stage: Stage; guidedAttempted: number; guidedCorrect: number } }>(response);
    if (data?.progress) {
      setAttempted(data.progress.guidedAttempted);
      setCorrect(data.progress.guidedCorrect);
      if (data.progress.stage !== 'GUIDED_PRACTICE') {
        onAdvance();
        return;
      }
    }
    fetchNext();
  };

  const accuracy = attempted > 0 ? Math.round((correct / attempted) * 100) : 0;

  return (
    <div>
      <div className="mb-6 rounded-2xl bg-indigo-50 p-4 text-sm font-bold text-indigo-700">
        {attempted} attempted (need {GUIDED_MIN_ATTEMPTS}+) · {accuracy}% accuracy (need {Math.round(GUIDED_ACCURACY_THRESHOLD * 100)}%+)
      </div>
      {loading ? (
        <Loader2 className="mx-auto my-16 h-8 w-8 animate-spin text-indigo-600" />
      ) : !question ? (
        <div className="rounded-3xl border border-dashed bg-white p-16 text-center font-bold text-slate-600">No more questions available for this topic right now.</div>
      ) : (
        <LearningPathQuestionCard key={question.id} question={question} onAnswered={handleAnswered} />
      )}
    </div>
  );
}

function TimedQuizStage({ encodedTopic, onAdvance }: { encodedTopic: string; onAdvance: () => void }) {
  const [questions, setQuestions] = useState<any[] | null>(null);
  const [startedAt, setStartedAt] = useState<string | null>(null);
  const [index, setIndex] = useState(0);
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const completingRef = useRef(false);

  useEffect(() => {
    fetch(`/api/student/learning-paths/${encodedTopic}/quiz/start`, { method: 'POST' })
      .then(async (response) => {
        const data = await readJsonResponse<{ questions?: any[]; startedAt?: string; suggestedSeconds?: number; error?: string }>(response);
        if (!response.ok || !data?.questions) {
          setError(data?.error || 'Could not start the quiz.');
          return;
        }
        setQuestions(data.questions);
        setStartedAt(data.startedAt ?? new Date().toISOString());
        setSecondsLeft(data.suggestedSeconds ?? data.questions.length * 60);
      });
  }, [encodedTopic]);

  useEffect(() => {
    if (!questions || secondsLeft <= 0) return;
    const id = setInterval(() => setSecondsLeft((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(id);
  }, [questions, secondsLeft <= 0]);

  const complete = async () => {
    if (!questions || !startedAt || completingRef.current) return;
    completingRef.current = true;
    const response = await fetch(`/api/student/learning-paths/${encodedTopic}/quiz/complete`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ questionIds: questions.map((q) => q.id), startedAt }),
    });
    if (response.ok) onAdvance();
  };

  useEffect(() => {
    if (questions && secondsLeft === 0) complete();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [secondsLeft, questions]);

  const handleAnswered = () => {
    if (!questions) return;
    if (index + 1 >= questions.length) {
      complete();
    } else {
      setIndex((i) => i + 1);
    }
  };

  const formatTime = (s: number) => `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, '0')}`;

  if (error) return <div className="rounded-3xl border border-amber-200 bg-amber-50 p-8 text-center font-bold text-amber-800">{error}</div>;
  if (!questions) return <Loader2 className="mx-auto my-16 h-8 w-8 animate-spin text-indigo-600" />;

  return (
    <div>
      <div className="mb-6 flex items-center justify-between rounded-2xl bg-indigo-50 p-4 text-sm font-black text-indigo-700">
        <span>Question {index + 1} of {questions.length}</span>
        <span className="flex items-center gap-1"><Clock className="h-4 w-4" />{formatTime(secondsLeft)}</span>
      </div>
      <LearningPathQuestionCard key={questions[index].id} question={questions[index]} onAnswered={handleAnswered} autoAdvanceMs={900} />
    </div>
  );
}

function RecoveryStage({ topic, encodedTopic, detail, onAdvance }: { topic: string; encodedTopic: string; detail: PathDetail; onAdvance: () => void }) {
  const [checking, setChecking] = useState(false);

  useEffect(() => {
    // Recompute on entry, in case the student already corrected these via
    // the general Practice Arena mistake-review flow.
    checkStatus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const checkStatus = async () => {
    setChecking(true);
    try {
      const response = await fetch(`/api/student/learning-paths/${encodedTopic}/recovery-status`);
      const data = await readJsonResponse<{ progress?: { stage: Stage } }>(response);
      if (data?.progress?.stage === 'COMPLETED') onAdvance();
    } finally {
      setChecking(false);
    }
  };

  return (
    <div className="rounded-3xl border bg-white p-8 text-center">
      <RotateCcw className="mx-auto mb-4 h-10 w-10 text-amber-500" />
      <p className="mb-2 text-lg font-black text-slate-900">{detail.recoveryQuestionIds.length} question{detail.recoveryQuestionIds.length === 1 ? '' : 's'} to correct</p>
      <p className="mb-6 text-sm text-slate-600">Review the quiz questions you missed. Once you answer them correctly, this path completes automatically.</p>
      <div className="flex items-center justify-center gap-3">
        <Link
          href={`/student/practice?mode=mistakes&topic=${encodeURIComponent(topic)}`}
          className="rounded-2xl bg-indigo-600 px-6 py-3 text-sm font-black text-white"
        >
          Review now
        </Link>
        <button
          type="button"
          onClick={checkStatus}
          disabled={checking}
          className="rounded-2xl border-2 border-slate-200 px-6 py-3 text-sm font-black text-slate-600 disabled:opacity-50"
        >
          {checking ? <Loader2 className="h-4 w-4 animate-spin" /> : "I've reviewed — check again"}
        </button>
      </div>
    </div>
  );
}

function CompletedStage({ topic, detail }: { topic: string; detail: PathDetail }) {
  return (
    <div className="rounded-3xl border bg-white p-10 text-center">
      <Trophy className="mx-auto mb-4 h-12 w-12 text-amber-500" />
      <p className="mb-2 text-2xl font-black text-slate-900">Path complete!</p>
      <p className="mb-6 text-slate-600">You've worked through examples, guided practice, and the quiz for {topic}.</p>
      {detail.quizScore !== null && <p className="mb-6 text-sm font-black text-indigo-700">Quiz score: {detail.quizScore}%</p>}
      <div className="flex items-center justify-center gap-3">
        <Link href="/student/mastery" className="inline-flex items-center gap-2 rounded-2xl bg-indigo-600 px-6 py-3 text-sm font-black text-white">
          <Target className="h-4 w-4" />View mastery
        </Link>
        <Link href="/student/learning-paths" className="rounded-2xl border-2 border-slate-200 px-6 py-3 text-sm font-black text-slate-600">
          More paths
        </Link>
      </div>
    </div>
  );
}
