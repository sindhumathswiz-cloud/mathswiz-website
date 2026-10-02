import { requireTeacherPremium } from '@/lib/teacher-guard';
import TeacherInterventionsClient from './TeacherInterventionsClient';

export default async function Page() {
  const locked = await requireTeacherPremium('Interventions is locked', 'Premium teachers can manage intervention plans for at-risk students here.');
  if (locked) return <div className="min-h-screen bg-slate-50 dark:bg-background p-8">{locked}</div>;
  return <TeacherInterventionsClient />;
}
