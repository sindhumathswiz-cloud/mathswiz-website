import { requireTeacherPremium } from '@/lib/teacher-guard';
import QueriesClient from './QueriesClient';

export default async function TeacherQueriesPage() {
  const locked = await requireTeacherPremium('Student Queries is locked', 'Premium teachers can review and respond to student doubts and queries here.');
  if (locked) return <div className="min-h-screen bg-slate-50 dark:bg-background p-8">{locked}</div>;
  return <QueriesClient />;
}
