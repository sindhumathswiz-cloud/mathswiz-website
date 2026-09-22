'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, BookOpen, CheckCircle2, Compass, Loader2, RotateCcw, Target } from 'lucide-react';

type Path = {
  topic: string;
  stage: 'EXAMPLES' | 'GUIDED_PRACTICE' | 'TIMED_QUIZ' | 'RECOVERY_PRACTICE' | 'COMPLETED';
  quizScore: number | null;
  completedAt: string | null;
};

const STAGES: Path['stage'][] = ['EXAMPLES', 'GUIDED_PRACTICE', 'TIMED_QUIZ', 'RECOVERY_PRACTICE', 'COMPLETED'];
const STAGE_LABELS: Record<Path['stage'], string> = {
  EXAMPLES: 'Worked examples',
  GUIDED_PRACTICE: 'Guided practice',
  TIMED_QUIZ: 'Timed quiz',
  RECOVERY_PRACTICE: 'Recovery practice',
  COMPLETED: 'Completed',
};

function StageTracker({ stage }: { stage: Path['stage'] }) {
  const currentIndex = STAGES.indexOf(stage);
  return (
    <div className="flex items-center gap-1">
      {STAGES.map((s, i) => (
        <div key={s} className={`h-1.5 flex-1 rounded-full ${i <= currentIndex ? (stage === 'COMPLETED' ? 'bg-emerald-500 dark:bg-emerald-400' : 'bg-indigo-500 dark:bg-brand') : 'bg-slate-100 dark:bg-white/10'}`} />
      ))}
    </div>
  );
}

export default function LearningPathsClient() {
  const [paths, setPaths] = useState<Path[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/student/learning-paths')
      .then((response) => response.json())
      .then((data) => setPaths(data.paths || []))
      .finally(() => setLoading(false));
  }, []);

  return (
    <main className="min-h-screen bg-slate-50 dark:bg-background p-6 md:p-10">
      <div className="mx-auto max-w-5xl">
        <Link href="/student/dashboard" className="mb-6 inline-flex items-center gap-2 text-sm font-bold text-indigo-700 dark:text-brand">
          <ArrowLeft className="h-4 w-4" />Student dashboard
        </Link>
        <div className="mb-8 flex items-center gap-3">
          <Compass className="h-9 w-9 text-indigo-600 dark:text-brand" />
          <div>
            <h1 className="font-display text-3xl font-black text-slate-900 dark:text-white">Learning Paths</h1>
            <p className="text-slate-600 dark:text-slate-400">Examples → guided practice → timed quiz → recovery, one topic at a time.</p>
          </div>
        </div>

        {loading ? (
          <Loader2 className="mx-auto my-20 h-8 w-8 animate-spin text-indigo-600 dark:text-brand" />
        ) : paths.length === 0 ? (
          <div className="rounded-3xl border border-dashed dark:border-white/10 bg-white dark:bg-surface p-16 text-center font-bold text-slate-600 dark:text-slate-400">
            No topics available for a learning path yet.
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {paths.map((path) => (
              <Link
                key={path.topic}
                href={`/student/learning-paths/${encodeURIComponent(path.topic)}`}
                className="rounded-2xl border dark:border-white/10 bg-white dark:bg-surface p-5 hover:border-indigo-300 dark:hover:border-brand/40 hover:shadow-md transition-all"
              >
                <div className="mb-3 flex items-center justify-between">
                  <p className="text-lg font-black text-slate-900 dark:text-white">{path.topic}</p>
                  {path.stage === 'COMPLETED' ? <CheckCircle2 className="h-5 w-5 text-emerald-500 dark:text-emerald-400" /> : path.stage === 'RECOVERY_PRACTICE' ? <RotateCcw className="h-5 w-5 text-amber-500 dark:text-accent-warm" /> : path.stage === 'EXAMPLES' ? <BookOpen className="h-5 w-5 text-slate-400 dark:text-slate-500" /> : <Target className="h-5 w-5 text-indigo-500 dark:text-brand" />}
                </div>
                <StageTracker stage={path.stage} />
                <p className="mt-2 text-xs font-black uppercase tracking-wide text-slate-500 dark:text-slate-400">{STAGE_LABELS[path.stage]}</p>
                {path.quizScore !== null && <p className="mt-1 text-xs font-bold text-slate-400 dark:text-slate-500">Quiz score: {path.quizScore}%</p>}
              </Link>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
