import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { getServerSession } from 'next-auth';
import { ArrowLeft, ChevronRight } from 'lucide-react';
import { authOptions } from '@/lib/auth';
import { PremiumFeatureNotice } from '@/components/PremiumAccess';
import { loadSmartbook, studentSmartbookAccess } from '@/lib/smartbook-data';
import { SMARTBOOK_PREMIUM_DESCRIPTION } from '@/lib/smartbook';

export const dynamic = 'force-dynamic';

export default async function SmartbookPage({ params }: { params: Promise<{ bookId: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id || session.user.role !== 'STUDENT') redirect('/login');
  const access = await studentSmartbookAccess(session.user.id);
  const { bookId } = await params;
  if (!access.premium) {
    return <main className="min-h-screen bg-slate-50 p-6 dark:bg-background md:p-10"><div className="mx-auto max-w-4xl"><PremiumFeatureNotice title="Smartbooks" description={SMARTBOOK_PREMIUM_DESCRIPTION} /></div></main>;
  }
  const book = await loadSmartbook(bookId, access.className);
  if (!book) notFound();

  return (
    <main className="min-h-screen bg-slate-50 p-6 dark:bg-background md:p-10">
      <div className="mx-auto max-w-4xl">
        <Link href="/student/smartbook" className="mb-6 inline-flex items-center gap-2 text-sm font-bold text-indigo-700 dark:text-brand">
          <ArrowLeft className="h-4 w-4" />All Smartbooks
        </Link>
        <h1 className="font-display text-3xl font-black text-slate-900 dark:text-white">{book.title}</h1>
        <p className="mb-8 mt-1 text-slate-600 dark:text-slate-400">{[book.author, book.publisher, book.edition].filter(Boolean).join(' · ')}{book.author || book.publisher || book.edition ? ' · ' : ''}{book.outline.questionCount} questions</p>

        <div className="space-y-6">
          {book.outline.chapters.map((chapter) => (
            <section key={chapter.id} aria-labelledby={`ch-${chapter.id}`} className="overflow-hidden rounded-2xl border border-slate-200 bg-white dark:border-white/10 dark:bg-surface">
              <h2 id={`ch-${chapter.id}`} className="border-b border-slate-100 px-5 py-4 font-display text-lg font-black text-slate-900 dark:border-white/10 dark:text-white">
                {chapter.chapterNumber ? `${chapter.chapterNumber}. ` : ''}{chapter.name}
              </h2>
              <ul className="divide-y divide-slate-100 dark:divide-white/10">
                {chapter.exercises.map((exercise) => (
                  <li key={exercise.id}>
                    <Link href={`/student/smartbook/${book.id}/exercises/${exercise.id}`} data-testid={`exercise-${exercise.id}`} className="flex items-center gap-4 px-5 py-3.5 hover:bg-slate-50 dark:hover:bg-white/5">
                      <span className="min-w-0 flex-1 font-bold text-slate-800 dark:text-slate-200">{exercise.label}</span>
                      {exercise.startPage != null && <span className="hidden text-xs tabular-nums text-slate-500 sm:inline">{exercise.endPage != null && exercise.endPage !== exercise.startPage ? `pp. ${exercise.startPage}–${exercise.endPage}` : `p. ${exercise.startPage}`}</span>}
                      <span className="shrink-0 rounded-full bg-indigo-50 px-2.5 py-1 text-xs font-black tabular-nums text-indigo-700 dark:bg-brand/10 dark:text-brand">{exercise.questionCount} questions</span>
                      <ChevronRight className="h-4 w-4 shrink-0 text-slate-300" />
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      </div>
    </main>
  );
}
