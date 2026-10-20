'use client';

import SmartbookPlayer, { type PlayerQuestion } from '@/components/smartbook/SmartbookPlayer';

interface ExerciseData {
  book: { id: string; title: string };
  chapter: { id: string; name: string; chapterNumber: string | null };
  exercise: { id: string; label: string; startPage: number | null; endPage: number | null };
  pages: number[];
  questions: PlayerQuestion[];
  previous: { id: string; label: string } | null;
  next: { id: string; label: string } | null;
}

/** A student working through one exercise of a Smartbook, one question at a time. */
export default function SmartbookExerciseClient({ data }: { data: ExerciseData }) {
  const base = `/student/smartbook/${data.book.id}`;
  return (
    <SmartbookPlayer
      mode="student"
      backHref={base}
      backLabel={data.book.title}
      eyebrow={`${data.chapter.chapterNumber ? `${data.chapter.chapterNumber}. ` : ''}${data.chapter.name}`}
      title={data.exercise.label}
      pages={data.pages}
      pageImageUrl={(page) => `/api/student/smartbook/${data.book.id}/pages/${page}`}
      questions={data.questions}
      storageKey={`smartbook:${data.exercise.id}:index`}
      previous={data.previous ? { href: `${base}/exercises/${data.previous.id}`, label: data.previous.label } : null}
      next={data.next ? { href: `${base}/exercises/${data.next.id}`, label: data.next.label } : null}
    />
  );
}
