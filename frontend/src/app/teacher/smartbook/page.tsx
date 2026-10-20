import { requireTeacherPremium } from '@/lib/teacher-guard';
import { loadQuestionSources } from '@/lib/question-sources';
import TeacherSmartbookClient from './TeacherSmartbookClient';

export const dynamic = 'force-dynamic';

export default async function TeacherSmartbookPage() {
  const locked = await requireTeacherPremium('Smartbook is locked', 'Premium teachers can set any exercise of a book as a test or homework in one step.');
  if (locked) return <div className="min-h-screen bg-slate-50 dark:bg-background p-8">{locked}</div>;
  const books = await loadQuestionSources();
  return <TeacherSmartbookClient books={books} />;
}
