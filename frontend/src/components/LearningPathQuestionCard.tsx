'use client';

import { useEffect, useState } from 'react';
import { CheckCircle2, Loader2, XCircle } from 'lucide-react';
import MathRenderer from '@/components/MathRenderer';
import { parseQuestionOptions } from '@/lib/arena-answer';
import { readJsonResponse } from '@/lib/http-json';

/**
 * Minimal "show question, pick option, submit, show result" card shared by
 * the learning path's guided-practice and timed-quiz stages. Correctness is
 * always determined server-side by the existing /api/student/practice/submit
 * route (never trusted from the client) -- this component just renders and
 * calls it, then reports the result back via onAnswered.
 */
export default function LearningPathQuestionCard({
  question,
  onAnswered,
  autoAdvanceMs = 1400,
}: {
  question: { id: string; content: string; options: unknown; correctAnswer?: string };
  // null means "skipped, no correctness signal" -- matches Practice
  // Arena's own skip semantics (neither helps nor hurts).
  onAnswered: (isCorrect: boolean | null) => void;
  autoAdvanceMs?: number;
}) {
  const [selectedOption, setSelectedOption] = useState<string | null>(null);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [isCorrect, setIsCorrect] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [startTime, setStartTime] = useState(Date.now());

  useEffect(() => {
    setSelectedOption(null);
    setIsSubmitted(false);
    setStartTime(Date.now());
  }, [question.id]);

  const options = parseQuestionOptions(question.options);

  const submit = async () => {
    if (!selectedOption || submitting) return;
    setSubmitting(true);
    try {
      const timeSpent = Math.round((Date.now() - startTime) / 1000);
      const response = await fetch('/api/student/practice/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ questionId: question.id, selectedOption, timeSpent }),
      });
      const data = await readJsonResponse<{ isCorrect?: boolean }>(response);
      const correct = !!data?.isCorrect;
      setIsCorrect(correct);
      setIsSubmitted(true);
      setTimeout(() => onAnswered(correct), autoAdvanceMs);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="rounded-3xl border bg-white p-6 md:p-8">
      <div className="mb-6 text-lg font-bold text-slate-900"><MathRenderer content={question.content} /></div>
      {options.length === 0 && (
        <div className="mb-4 rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm font-bold text-amber-800">
          This question has an invalid or incomplete option list. You can skip it safely.
        </div>
      )}
      <div className="space-y-3">
        {options.map((opt, idx) => {
          const letter = String.fromCharCode(65 + idx);
          const selected = selectedOption === letter;
          const correct = isSubmitted && letter === question.correctAnswer;
          const wrong = isSubmitted && selected && letter !== question.correctAnswer;
          return (
            <div
              key={letter}
              data-testid={`option-${letter}`}
              onClick={() => !isSubmitted && setSelectedOption(letter)}
              className={`flex cursor-pointer items-center gap-4 rounded-2xl border-2 p-4 transition-all ${
                correct ? 'border-emerald-400 bg-emerald-50' : wrong ? 'border-rose-400 bg-rose-50' : selected ? 'border-indigo-400 bg-indigo-50' : 'border-slate-200 hover:border-slate-300'
              }`}
            >
              <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-xl font-black text-sm ${selected ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-500'}`}>
                {letter}
              </div>
              <div className="text-sm font-bold text-slate-700"><MathRenderer content={opt} /></div>
            </div>
          );
        })}
      </div>
      {!isSubmitted && options.length === 0 ? (
        <button
          type="button"
          onClick={() => onAnswered(null)}
          className="mt-6 w-full rounded-2xl bg-amber-600 py-4 text-sm font-black uppercase tracking-widest text-white"
        >
          Skip Invalid Question
        </button>
      ) : !isSubmitted ? (
        <button
          type="button"
          data-testid="submit-answer"
          onClick={submit}
          disabled={!selectedOption || submitting}
          className="mt-6 w-full rounded-2xl bg-indigo-600 py-4 text-sm font-black uppercase tracking-widest text-white disabled:opacity-40"
        >
          {submitting ? <Loader2 className="mx-auto h-5 w-5 animate-spin" /> : 'Submit'}
        </button>
      ) : (
        <div className={`mt-6 flex items-center gap-3 rounded-2xl p-4 font-black ${isCorrect ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'}`}>
          {isCorrect ? <CheckCircle2 className="h-5 w-5" /> : <XCircle className="h-5 w-5" />}
          {isCorrect ? 'Correct!' : 'Not quite — moving on.'}
        </div>
      )}
    </div>
  );
}
