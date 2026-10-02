import { requireTeacherPremium } from '@/lib/teacher-guard';
import HomeworkReviewClient from './HomeworkReviewClient';

export default async function TeacherHomeworkPage() {
  const locked = await requireTeacherPremium('Homework Review is locked', 'Premium teachers can review and grade submitted homework here.');
  if (locked) return <div className="min-h-screen bg-slate-50 dark:bg-background p-8">{locked}</div>;
  return <HomeworkReviewClient />;
}
