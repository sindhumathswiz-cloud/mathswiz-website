import { requireTeacherPremium } from '@/lib/teacher-guard';
import KnowledgeBaseClient from './KnowledgeBaseClient';

export default async function TeacherKnowledgeBasePage() {
  const locked = await requireTeacherPremium('AI training content is locked', 'Premium teachers can manage the AI-assisted content workspace here.');
  if (locked) return <div className="min-h-screen bg-slate-50 dark:bg-background p-8">{locked}</div>;
  return <KnowledgeBaseClient />;
}
