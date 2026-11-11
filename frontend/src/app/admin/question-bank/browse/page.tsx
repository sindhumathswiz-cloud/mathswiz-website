import { loadQuestionSources } from '@/lib/question-sources';
import QuestionBrowser from '@/components/question-browser/QuestionBrowser';

export const dynamic = 'force-dynamic';

export default async function AdminFindQuestionsPage() {
  return <QuestionBrowser role="ADMIN" books={await loadQuestionSources()} />;
}
