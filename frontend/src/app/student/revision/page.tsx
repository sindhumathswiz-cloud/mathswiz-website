import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getServerSession } from 'next-auth';
import { ArrowLeft, BookMarked, ChevronRight } from 'lucide-react';
import prisma from '@/lib/prisma';
import { authOptions } from '@/lib/auth';
import { isPremiumSubscription } from '@/lib/subscription';
import { PremiumFeatureNotice } from '@/components/PremiumAccess';
import { loadRevisionChapters } from '@/lib/student-revision';
import { KIND_LABEL, REVISION_KINDS } from '@/lib/revision-content';

export const dynamic = 'force-dynamic';

export default async function StudentRevisionPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id || session.user.role !== 'STUDENT') redirect('/login');

  const student = await prisma.user.findUnique({ where: { id: session.user.id }, select: { subscription: true, class: true } });
  // Free students get the notice only: nothing about the content is fetched for them.
  const premium = isPremiumSubscription(student?.subscription);
  const chapters = premium ? await loadRevisionChapters(student?.class) : [];

  return (
    <main className="min-h-screen bg-slate-50 p-6 dark:bg-background md:p-10">
      <div className="mx-auto max-w-4xl">
        <Link href="/student/dashboard" className="mb-6 inline-flex items-center gap-2 text-sm font-bold text-indigo-700 dark:text-brand">
          <ArrowLeft className="h-4 w-4" />Student dashboard
        </Link>
        <div className="mb-8 flex items-center gap-3">
          <BookMarked className="h-9 w-9 text-indigo-600 dark:text-brand" />
          <div>
            <h1 className="font-display text-3xl font-black text-slate-900 dark:text-white">Revision sheets</h1>
            <p className="text-slate-600 dark:text-slate-400">Definitions, theorems and formulas for each chapter, taken straight from your book. Look them over before a chapter test.</p>
          </div>
        </div>

        {!premium ? (
          <PremiumFeatureNotice title="Chapter revision sheets" description="Definitions, theorem statements and formula sheets for every chapter, with flashcards to practise them before a chapter test." />
        ) : chapters.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center text-slate-500 dark:border-white/10 dark:bg-surface">
            No revision sheets are ready for {student?.class ?? 'your class'} yet. They appear here as each chapter is reviewed and approved.
          </p>
        ) : (
          <ul className="divide-y divide-slate-200 overflow-hidden rounded-2xl border border-slate-200 bg-white dark:divide-white/10 dark:border-white/10 dark:bg-surface">
            {chapters.map((chapter) => (
              <li key={chapter.chapterId}>
                <Link href={`/student/revision/${chapter.chapterId}`} className="flex items-center gap-4 px-5 py-4 hover:bg-slate-50 dark:hover:bg-white/5">
                  <div className="min-w-0 flex-1">
                    <p className="font-black text-slate-900 dark:text-white">{chapter.chapterNumber ? `${chapter.chapterNumber}. ` : ''}{chapter.name}</p>
                    <p className="mt-0.5 text-xs text-slate-500">
                      {chapter.bookTitle} · {REVISION_KINDS.filter((kind) => chapter.byKind[kind]).map((kind) => `${chapter.byKind[kind]} ${KIND_LABEL[kind].toLowerCase()}`).join(' · ')}
                    </p>
                  </div>
                  <span className="shrink-0 rounded-full bg-indigo-50 px-2.5 py-1 text-xs font-black tabular-nums text-indigo-700 dark:bg-brand/10 dark:text-brand">{chapter.total} items</span>
                  <ChevronRight className="h-4 w-4 shrink-0 text-slate-300" />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </main>
  );
}
