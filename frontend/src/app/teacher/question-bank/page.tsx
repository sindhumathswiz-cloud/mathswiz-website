import { requireTeacherPremium } from '@/lib/teacher-guard';
import QuestionBankClient from './QuestionBankClient';

export default async function TeacherQuestionBankPage() {
  const locked = await requireTeacherPremium('Question Bank is locked', 'Premium teachers can curate questions, build collections, and use verified items in assessments.');
  if (locked) return <div className="min-h-screen bg-slate-50 dark:bg-background p-8">{locked}</div>;
  return <QuestionBankClient />;
}
