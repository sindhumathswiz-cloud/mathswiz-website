import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getServerSession } from 'next-auth';
import { ArrowLeft, BookOpenText, ChevronRight } from 'lucide-react';
import { authOptions } from '@/lib/auth';
import { PremiumFeatureNotice } from '@/components/PremiumAccess';
import { loadStudentSmartbooks, studentSmartbookAccess } from '@/lib/smartbook-data';
import { SMARTBOOK_PREMIUM_DESCRIPTION } from '@/lib/smartbook';

export const dynamic = 'force-dynamic';

export default async function StudentSmartbooksPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id || session.user.role !== 'STUDENT') redirect('/login');
  const access = await studentSmartbookAccess(session.user.id);
  // Free students get the notice only: nothing about the books is fetched for them.
  const books = access.premium ? await loadStudentSmartbooks(access.className) : [];

  return (
    <main className="min-h-screen bg-slate-50 p-6 dark:bg-background md:p-10">
      <div className="mx-auto max-w-4xl">
        <Link href="/student/dashboard" className="mb-6 inline-flex items-center gap-2 text-sm font-bold text-indigo-700 dark:text-brand">
          <ArrowLeft className="h-4 w-4" />Student dashboard
        </Link>
        <div className="mb-8 flex items-center gap-3">
          <BookOpenText className="h-9 w-9 text-indigo-600 dark:text-brand" />
          <div>
            <h1 className="font-display text-3xl font-black text-slate-900 dark:text-white">Smartbooks</h1>
            <p className="text-slate-600 dark:text-slate-400">Read your book&apos;s exercise pages and practise every question beside them, with the answer and working once you have tried.</p>
          </div>
        </div>

        {!access.premium ? (
          <PremiumFeatureNotice title="Smartbooks" description={SMARTBOOK_PREMIUM_DESCRIPTION} />
        ) : books.length === 0 ? (
          <p data-testid="smartbooks-empty" className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center text-slate-500 dark:border-white/10 dark:bg-surface">
            No Smartbooks are ready for {access.className ?? 'your class'} yet. They appear here as your teachers publish them.
          </p>
        ) : (
          <ul className="grid gap-4 sm:grid-cols-2">
            {books.map((book) => (
              <li key={book.id}>
                <Link href={`/student/smartbook/${book.id}`} data-testid={`smartbook-${book.id}`} className="flex h-full items-start gap-4 rounded-2xl border border-slate-200 bg-white p-5 hover:border-indigo-300 dark:border-white/10 dark:bg-surface dark:hover:border-brand/40">
                  <div className="min-w-0 flex-1">
                    <p className="font-black text-slate-900 dark:text-white">{book.title}</p>
                    <p className="mt-0.5 text-xs text-slate-500">{[book.author, book.publisher, book.edition].filter(Boolean).join(' · ')}</p>
                    <p className="mt-3 text-sm text-slate-700 dark:text-slate-300">
                      {book.outline.chapters.length} chapter{book.outline.chapters.length === 1 ? '' : 's'} · {book.outline.questionCount} questions
                    </p>
                  </div>
                  <ChevronRight className="mt-1 h-4 w-4 shrink-0 text-slate-300" />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </main>
  );
}
