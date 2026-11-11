'use client';

import { useEffect, useState } from 'react';

/**
 * The figures of a question (graphs, diagrams), shown under its text wherever students and teachers read it.
 * Every QuestionFigures on a page asks in one request (/api/figures, lib/figure-display), and an answer is kept for
 * the rest of the visit, so a list of questions or a printed paper costs one request, not one per question.
 */

export interface ShownFigure {
  url: string;
  caption: string | null;
}

const known = new Map<string, ShownFigure[]>();
let waiting: Map<string, Array<(figures: ShownFigure[]) => void>> | null = null;

function figuresFor(questionId: string): Promise<ShownFigure[]> {
  const cached = known.get(questionId);
  if (cached) return Promise.resolve(cached);
  return new Promise((resolve) => {
    if (!waiting) {
      waiting = new Map();
      // Collect the questions rendered in the same pass, then ask once.
      setTimeout(async () => {
        const batch = waiting!;
        waiting = null;
        const ids = [...batch.keys()];
        let figures: Record<string, ShownFigure[]> = {};
        try {
          for (let i = 0; i < ids.length; i += 100) {
            const res = await fetch(`/api/figures?questionIds=${encodeURIComponent(ids.slice(i, i + 100).join(','))}`);
            if (res.ok) figures = { ...figures, ...((await res.json()).figures ?? {}) };
          }
        } catch { /* no figures is the safe outcome */ }
        for (const [id, callbacks] of batch) {
          const list = figures[id] ?? [];
          known.set(id, list);
          for (const cb of callbacks) cb(list);
        }
      }, 0);
    }
    const callbacks = waiting.get(questionId) ?? [];
    callbacks.push(resolve);
    waiting.set(questionId, callbacks);
  });
}

/** Test-only: forget what has been fetched. */
export function resetQuestionFigures() {
  known.clear();
  waiting = null;
}

export default function QuestionFigures({ questionId, className = '' }: { questionId: string | null | undefined; className?: string }) {
  const [figures, setFigures] = useState<ShownFigure[]>(() => (questionId ? known.get(questionId) ?? [] : []));

  useEffect(() => {
    let live = true;
    if (questionId) figuresFor(questionId).then((list) => { if (live) setFigures(list); });
    else setFigures([]);
    return () => { live = false; };
  }, [questionId]);

  if (!figures.length) return null;
  return (
    <div className={`my-3 flex flex-wrap gap-3 ${className}`} data-testid="question-figures">
      {figures.map((f, i) => (
        <figure key={f.url} className="max-w-full">
          {/* eslint-disable-next-line @next/next/no-img-element -- served from private storage behind auth, not next/image's loader */}
          {/* Loaded straight away, not lazily: a printed paper needs every figure in place before it prints. */}
          <img src={f.url} alt={f.caption ?? `Figure ${i + 1} for this question`} className="max-h-80 max-w-full rounded-lg border border-slate-200 bg-white object-contain dark:border-white/10" />
          {f.caption && <figcaption className="mt-1 text-xs text-slate-500 dark:text-slate-400">{f.caption}</figcaption>}
        </figure>
      ))}
    </div>
  );
}
