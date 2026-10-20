import { notFound } from 'next/navigation';
import prisma from '@/lib/prisma';
import { requireTeacherPremium, requireTeacherSession } from '@/lib/teacher-guard';
import { loadExerciseForTeacher } from '@/lib/smartbook-data';
import TeacherExerciseClient from './TeacherExerciseClient';

export const dynamic = 'force-dynamic';

export default async function TeacherSmartbookExercisePage({ params }: { params: Promise<{ bookId: string; exerciseId: string }> }) {
  const locked = await requireTeacherPremium('Smartbook is locked', 'Premium teachers can go through any exercise of a book, bookmark questions and add them to tests.');
  if (locked) return <div className="min-h-screen bg-slate-50 dark:bg-background p-8">{locked}</div>;
  const session = await requireTeacherSession();
  const { bookId, exerciseId } = await params;
  const data = await loadExerciseForTeacher(bookId, exerciseId);
  if (!data) notFound();
  const favorites = await prisma.teacherFavorite.findMany({
    where: { teacherId: session.user.id, questionId: { in: data.questions.map((q) => q.id) } },
    select: { questionId: true },
  });
  return <TeacherExerciseClient data={JSON.parse(JSON.stringify(data))} bookmarked={favorites.map((f) => f.questionId)} />;
}
