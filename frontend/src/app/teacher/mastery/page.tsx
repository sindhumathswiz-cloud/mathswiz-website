import { requireTeacherPremium } from '@/lib/teacher-guard';
import TeacherMasteryClient from './TeacherMasteryClient';

export default async function TeacherMasteryPage() {
  const locked = await requireTeacherPremium('Student Mastery is locked', 'Premium teachers can track per-topic mastery trends across their classes here.');
  if (locked) return <div className="min-h-screen bg-slate-50 dark:bg-background p-8">{locked}</div>;
  return <TeacherMasteryClient />;
}
