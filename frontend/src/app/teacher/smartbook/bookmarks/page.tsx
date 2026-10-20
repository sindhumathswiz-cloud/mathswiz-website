import { requireTeacherPremium } from '@/lib/teacher-guard';
import BookmarksClient from './BookmarksClient';

export const dynamic = 'force-dynamic';

export default async function TeacherBookmarksPage() {
  const locked = await requireTeacherPremium('Bookmarks are locked', 'Premium teachers can bookmark questions from any book and add them to tests.');
  if (locked) return <div className="min-h-screen bg-slate-50 dark:bg-background p-8">{locked}</div>;
  return <BookmarksClient />;
}
