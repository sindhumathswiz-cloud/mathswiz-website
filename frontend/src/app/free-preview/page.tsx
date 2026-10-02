'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { BarChart3, BookOpenCheck, BrainCircuit, CheckCircle2, ClipboardCheck, CreditCard, Loader2, LockKeyhole } from 'lucide-react';
import MathRenderer from '@/components/MathRenderer';

type Question = { id: string; content: string; options: string[]; difficulty: string; topic: string; isInteractive: boolean; explanation: string | null };
type Chapter = { classLevel: 'Class 11' | 'Class 12'; chapterName: string; questions: Question[] };
type Result = { isCorrect: boolean; explanation: string };
type Tab = 'dashboard' | 'practice' | 'flashcards' | 'mock';

export default function FreePreviewPage() {
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [loading, setLoading] = useState(true);
  const [classLevel, setClassLevel] = useState<'Class 11' | 'Class 12'>('Class 11');
  const [tab, setTab] = useState<Tab>('dashboard');
  const [cardId, setCardId] = useState<string | null>(null);
  const [questionIndex, setQuestionIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [results, setResults] = useState<Record<string, Result>>({});

  useEffect(() => {
    fetch('/api/free-preview').then(res => res.json()).then(data => setChapters(data.chapters || [])).finally(() => setLoading(false));
  }, []);

  const chapter = chapters.find(item => item.classLevel === classLevel) || chapters[0];
  const questions = chapter?.questions || [];
  const scoreable = questions.filter(question => question.isInteractive);
  const current = scoreable[questionIndex % Math.max(scoreable.length, 1)];
  const score = useMemo(() => Object.values(results).filter(result => result.isCorrect).length, [results]);

  async function answer(question: Question, answerIndex: number) {
    setAnswers(previous => ({ ...previous, [question.id]: answerIndex }));
    const response = await fetch('/api/free-preview/answer', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ questionId: question.id, answerIndex }) });
    const data = await response.json();
    if (response.ok) setResults(previous => ({ ...previous, [question.id]: data }));
  }

  function changeClass(nextClass: 'Class 11' | 'Class 12') {
    setClassLevel(nextClass); setQuestionIndex(0); setAnswers({}); setResults({}); setCardId(null); setTab('dashboard');
  }

  if (loading) return <div className="grid min-h-screen place-items-center"><Loader2 className="h-10 w-10 animate-spin text-indigo-600" /></div>;
  if (!chapter) return <div className="grid min-h-screen place-items-center px-5 text-center"><div><h1 className="text-3xl font-black">Free preview is being prepared.</h1><Link href="/pricing" className="mt-5 inline-flex rounded-xl bg-indigo-600 px-5 py-3 font-bold text-white">View plans</Link></div></div>;

  const nav: Array<[Tab, typeof BarChart3, string]> = [['dashboard', BarChart3, 'Dashboard'], ['practice', BookOpenCheck, 'Practice'], ['flashcards', BrainCircuit, 'Flashcards'], ['mock', ClipboardCheck, 'Chapter mock']];
  return <div className="min-h-screen bg-gray-50 px-4 pb-20 pt-28 text-slate-950 dark:bg-background dark:text-white sm:px-8 lg:pt-32"><div className="mx-auto max-w-7xl">
    <section className="rounded-[2rem] bg-slate-950 p-7 text-white shadow-xl sm:p-10"><div className="flex flex-col justify-between gap-6 md:flex-row md:items-center"><div><p className="text-xs font-black uppercase tracking-[.18em] text-indigo-300">Free student dashboard</p><h1 className="mt-3 text-3xl font-black sm:text-4xl">See the learning flow before you enrol.</h1><p className="mt-3 max-w-2xl leading-7 text-slate-300">Real verified first-chapter content, with premium areas clearly protected.</p></div><Link href="/pricing" className="inline-flex items-center justify-center gap-2 rounded-2xl bg-white px-5 py-3.5 text-sm font-black text-indigo-700"><CreditCard className="h-4 w-4" />View plans</Link></div></section>
    <section className="mt-6 flex flex-col justify-between gap-4 rounded-3xl border border-slate-200 bg-white p-4 dark:border-white/10 dark:bg-white/[.03] md:flex-row md:items-center"><div className="flex rounded-2xl bg-slate-100 p-1 dark:bg-white/10">{chapters.map(item => <button key={item.classLevel} onClick={() => changeClass(item.classLevel)} className={`rounded-xl px-4 py-2.5 text-sm font-black ${item.classLevel === classLevel ? 'bg-white text-indigo-700 shadow-sm dark:bg-slate-800 dark:text-indigo-200' : 'text-slate-500'}`}>{item.classLevel}</button>)}</div><p className="text-sm font-bold text-slate-600 dark:text-slate-300"><span className="text-indigo-600">{chapter.chapterName}</span> · {questions.length} verified questions · {scoreable.length} scoreable</p></section>
    <div className="mt-6 grid gap-6 lg:grid-cols-[230px_1fr]"><aside className="rounded-3xl border border-slate-200 bg-white p-3 shadow-sm dark:border-white/10 dark:bg-white/[.03]"><p className="px-3 py-2 text-[10px] font-black uppercase tracking-widest text-slate-400">Preview dashboard</p>{nav.map(([value, Icon, label]) => <button key={value} onClick={() => setTab(value)} className={`mb-1 flex w-full items-center gap-3 rounded-2xl px-3 py-3 text-left text-sm font-black ${tab === value ? 'bg-indigo-600 text-white' : 'text-slate-600 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-white/5'}`}><Icon className="h-4 w-4" />{label}</button>)}<div className="mt-5 rounded-2xl bg-slate-100 p-4 dark:bg-white/[.06]"><LockKeyhole className="h-5 w-5 text-indigo-600" /><p className="mt-3 text-xs font-black">Full dashboard after enrolment.</p><p className="mt-2 text-xs text-slate-500">All chapters, saved mistakes and progress trends unlock with a plan.</p></div></aside>
      <main>{tab === 'dashboard' && <Dashboard chapter={chapter} attempted={Object.keys(results).length} score={score} onPractice={() => setTab('practice')} />}{tab === 'practice' && <Practice question={current} answer={current ? answers[current.id] : undefined} result={current ? results[current.id] : undefined} onAnswer={answer} onNext={() => setQuestionIndex(index => index + 1)} />}{tab === 'flashcards' && <Flashcards questions={questions} flippedId={cardId} onFlip={setCardId} />}{tab === 'mock' && <Mock questions={scoreable.slice(0, 5)} answers={answers} results={results} onAnswer={answer} />}</main>
    </div>
  </div></div>;
}

function Dashboard({ chapter, attempted, score, onPractice }: { chapter: Chapter; attempted: number; score: number; onPractice: () => void }) {
  return <div className="space-y-6"><div className="grid gap-4 sm:grid-cols-3">{[['Free chapter', chapter.chapterName], ['Questions attempted', `${attempted}/${chapter.questions.length}`], ['Preview score', attempted ? `${Math.round((score / attempted) * 100)}%` : '—']].map(([label, value]) => <div key={label} className="rounded-3xl border border-slate-200 bg-white p-6 dark:border-white/10 dark:bg-white/[.03]"><p className="text-xs font-black uppercase tracking-widest text-slate-400">{label}</p><p className="mt-3 text-xl font-black text-indigo-700 dark:text-indigo-200">{value}</p></div>)}</div><div className="rounded-[2rem] border border-slate-200 bg-white p-7 dark:border-white/10 dark:bg-white/[.03]"><p className="text-xs font-black uppercase tracking-widest text-indigo-600">Today’s action</p><h2 className="mt-3 text-3xl font-black">Explore the free first chapter.</h2><p className="mt-4 leading-7 text-slate-600 dark:text-slate-300">This is a restricted version of the student learning experience. Flashcards include every verified question; only questions with a complete answer key appear in scored practice.</p><button onClick={onPractice} className="mt-7 rounded-2xl bg-indigo-600 px-5 py-3.5 text-sm font-black text-white">Open practice</button></div></div>;
}

function Practice({ question, answer, result, onAnswer, onNext }: { question?: Question; answer?: number; result?: Result; onAnswer: (question: Question, index: number) => void; onNext: () => void }) {
  if (!question) return <div className="rounded-3xl border border-amber-200 bg-amber-50 p-7 font-bold text-amber-900">This chapter has reading and flashcard content, but no answer-keyed questions for scored practice yet.</div>;
  return <div className="rounded-[2rem] border border-slate-200 bg-white p-7 shadow-sm dark:border-white/10 dark:bg-white/[.03]"><p className="text-xs font-black uppercase tracking-widest text-indigo-600">Free chapter practice · {question.topic}</p><div className="mt-7 text-xl font-bold leading-8"><MathRenderer content={question.content} /></div><div className="mt-7 grid gap-3">{question.options.map((option, index) => <div key={option} role="button" tabIndex={0} onClick={() => !result && onAnswer(question, index)} onKeyDown={event => { if (!result && (event.key === 'Enter' || event.key === ' ')) onAnswer(question, index); }} className={`cursor-pointer rounded-2xl border p-4 text-left font-bold ${answer === index ? result?.isCorrect ? 'border-emerald-500 bg-emerald-50' : 'border-indigo-500 bg-indigo-50 dark:bg-indigo-400/10' : 'border-slate-200 hover:border-indigo-300 dark:border-white/10'}`}><span className="mr-3 text-indigo-600">{String.fromCharCode(65 + index)}.</span><MathRenderer content={option} /></div>)}</div>{result && <div className="mt-6 rounded-2xl bg-emerald-50 p-5 dark:bg-emerald-400/10"><p className="font-black">{result.isCorrect ? 'Correct—well done.' : 'Review the solution, then try the next question.'}</p><div className="mt-3 text-sm leading-6"><MathRenderer content={result.explanation} /></div><button onClick={onNext} className="mt-4 text-sm font-black underline">Next free question</button></div>}</div>;
}

function Flashcards({ questions, flippedId, onFlip }: { questions: Question[]; flippedId: string | null; onFlip: (id: string | null) => void }) {
  return <div className="grid gap-4 sm:grid-cols-2">{questions.map(question => { const flipped = question.id === flippedId; return <div key={question.id} role="button" tabIndex={0} onClick={() => onFlip(flipped ? null : question.id)} onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') onFlip(flipped ? null : question.id); }} className="min-h-56 cursor-pointer rounded-[2rem] border border-slate-200 bg-white p-7 text-left shadow-sm transition hover:-translate-y-0.5 dark:border-white/10 dark:bg-white/[.03]"><p className="text-xs font-black uppercase tracking-widest text-indigo-600">{flipped ? 'Solution' : 'Flashcard · tap to reveal solution'}</p>{flipped ? <div className="mt-6 text-sm leading-7 text-slate-700 dark:text-slate-200">{question.explanation ? <MathRenderer content={question.explanation} /> : <p>A verified step-by-step solution has not yet been added for this question.</p>}</div> : <div className="mt-6 text-lg font-bold leading-7"><MathRenderer content={question.content} /></div>}</div>; })}</div>;
}

function Mock({ questions, answers, results, onAnswer }: { questions: Question[]; answers: Record<string, number>; results: Record<string, Result>; onAnswer: (question: Question, index: number) => void }) {
  if (!questions.length) return <div className="rounded-3xl border border-amber-200 bg-amber-50 p-7 font-bold text-amber-900">This chapter has verified reading content, but no answer-keyed questions for a scored mock yet.</div>;
  const completed = questions.every(question => results[question.id]); const score = questions.filter(question => results[question.id]?.isCorrect).length;
  return <div className="rounded-[2rem] border border-slate-200 bg-white p-7 shadow-sm dark:border-white/10 dark:bg-white/[.03]"><div className="flex justify-between gap-4"><div><p className="text-xs font-black uppercase tracking-widest text-indigo-600">Free chapter mock</p><h2 className="mt-2 text-2xl font-black">{questions.length} questions from this chapter</h2></div><b>{completed ? `${score}/${questions.length}` : 'In progress'}</b></div><div className="mt-8 space-y-7">{questions.map((question, number) => <div key={question.id} className="border-t border-slate-100 pt-6 first:border-0 first:pt-0 dark:border-white/10"><div className="font-black">{number + 1}. <MathRenderer content={question.content} /></div><div className="mt-3 grid gap-2">{question.options.map((option, index) => <div key={option} role="button" tabIndex={0} onClick={() => !results[question.id] && onAnswer(question, index)} onKeyDown={event => { if (!results[question.id] && (event.key === 'Enter' || event.key === ' ')) onAnswer(question, index); }} className={`cursor-pointer rounded-xl border px-4 py-3 text-left text-sm font-bold ${answers[question.id] === index ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-400/10' : 'border-slate-200 dark:border-white/10'}`}><MathRenderer content={option} /></div>)}</div>{results[question.id] && <p className={`mt-2 text-sm font-bold ${results[question.id].isCorrect ? 'text-emerald-600' : 'text-amber-600'}`}>{results[question.id].isCorrect ? 'Correct' : 'Review the solution in Practice.'}</p>}</div>)}</div></div>;
}
