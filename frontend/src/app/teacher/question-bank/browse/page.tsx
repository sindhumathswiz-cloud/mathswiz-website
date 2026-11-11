import { requireTeacherPremium } from '@/lib/teacher-guard';
import { loadQuestionSources } from '@/lib/question-sources';
import QuestionBrowser from '@/components/question-browser/QuestionBrowser';

export const dynamic = 'force-dynamic';

export default async function TeacherFindQuestionsPage() {
  const locked = await requireTeacherPremium('Finding questions is locked', 'Premium teachers can search the question bank and build question papers and practice sheets from it.');
  if (locked) return <div className="min-h-screen bg-slate-50 dark:bg-background p-8">{locked}</div>;
  return <QuestionBrowser role="TEACHER" books={await loadQuestionSources()} />;
}
