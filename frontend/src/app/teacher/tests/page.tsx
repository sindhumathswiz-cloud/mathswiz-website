import { requireTeacherPremium } from '@/lib/teacher-guard';
import TestsClient from './TestsClient';

export default async function TeacherTestsPage() {
  const locked = await requireTeacherPremium('Test & Exam Engine is locked', 'Premium teachers can build, assign, and analyse class assessments from this workspace.');
  if (locked) return <div className="min-h-screen bg-slate-50 dark:bg-background p-8">{locked}</div>;
  return <TestsClient />;
}
