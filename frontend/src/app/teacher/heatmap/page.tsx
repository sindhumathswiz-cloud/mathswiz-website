import { requireTeacherPremium } from '@/lib/teacher-guard';
import HeatmapClient from './HeatmapClient';

export default async function TeacherHeatmapPage() {
  const locked = await requireTeacherPremium('Class Heatmap is locked', 'Premium teachers can see per-topic mastery heat and at-risk students across their classes here.');
  if (locked) return <div className="min-h-screen bg-slate-50 dark:bg-background p-8">{locked}</div>;
  return <HeatmapClient />;
}
