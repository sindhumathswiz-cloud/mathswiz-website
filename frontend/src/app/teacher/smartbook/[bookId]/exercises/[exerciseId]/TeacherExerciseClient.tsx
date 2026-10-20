'use client';

import { useState } from 'react';
import SmartbookPlayer, { type PlayerQuestion } from '@/components/smartbook/SmartbookPlayer';
import TeacherQuestionTools from '@/components/smartbook/TeacherQuestionTools';

interface ExerciseData {
  book: { id: string; title: string };
  chapter: { id: string; name: string; chapterNumber: string | null };
  exercise: { id: string; label: string; startPage: number | null; endPage: number | null };
  pages: number[];
  questions: PlayerQuestion[];
  previous: { id: string; label: string } | null;
  next: { id: string; label: string } | null;
}

/** A teacher going through one exercise: answer and solution shown, with Bookmark and Add to test on each question. */
export default function TeacherExerciseClient({ data, bookmarked }: { data: ExerciseData; bookmarked: string[] }) {
  const [saved, setSaved] = useState(() => new Set(bookmarked));
  const base = `/teacher/smartbook/${data.book.id}`;
  return (
    <SmartbookPlayer
      mode="teacher"
      backHref="/teacher/smartbook"
      backLabel="Smartbook"
      eyebrow={`${data.book.title} · ${data.chapter.chapterNumber ? `${data.chapter.chapterNumber}. ` : ''}${data.chapter.name}`}
      title={data.exercise.label}
      pages={data.pages}
      pageImageUrl={(page) => `/api/teacher/smartbook/${data.book.id}/pages/${page}`}
      questions={data.questions}
      storageKey={`teacher-smartbook:${data.exercise.id}:index`}
      previous={data.previous ? { href: `${base}/exercises/${data.previous.id}`, label: data.previous.label } : null}
      next={data.next ? { href: `${base}/exercises/${data.next.id}`, label: data.next.label } : null}
      renderTeacherTools={(q) => (
        <TeacherQuestionTools
          questionId={q.id}
          bookmarked={saved.has(q.id)}
          onBookmarkChange={(on) => setSaved((all) => { const next = new Set(all); if (on) next.add(q.id); else next.delete(q.id); return next; })}
          newTestTitle={`${data.chapter.name} · ${data.exercise.label}`}
        />
      )}
    />
  );
}
