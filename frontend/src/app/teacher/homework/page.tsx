import { requireTeacherPremium } from '@/lib/teacher-guard';
import HomeworkReviewClient from './HomeworkReviewClient';

export default async function TeacherHomeworkPage() {
  const locked = await requireTeacherPremium('Written answer review is locked', 'Premium teachers can mark written answers from homework and mock exams here.');
  if (locked) return <div className="min-h-screen bg-slate-50 dark:bg-background p-8">{locked}</div>;
  return <HomeworkReviewClient />;
}
