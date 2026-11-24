import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getServerSession } from 'next-auth';
import { ArrowLeft, BookOpenText } from 'lucide-react';
import { authOptions } from '@/lib/auth';
import { PremiumFeatureNotice } from '@/components/PremiumAccess';
import { studentSmartbookAccess } from '@/lib/smartbook-data';
import { loadReaderShelf, studentBooksWhere } from '@/lib/book-reader';
import BookShelf from '@/components/smartbook/BookShelf';

export const dynamic = 'force-dynamic';

const BOOKS_PREMIUM_DESCRIPTION = 'Read your textbooks page by page, exactly as printed, with a whiteboard beside them to work on.';

export default async function StudentBooksPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id || session.user.role !== 'STUDENT') redirect('/login');
  const access = await studentSmartbookAccess(session.user.id);
  // Free students get the notice only: nothing about the books is fetched for them.
  const books = access.premium ? await loadReaderShelf(studentBooksWhere(access.className)) : [];

  return (
    <main className="min-h-screen bg-slate-50 p-6 dark:bg-background md:p-10">
      <div className="mx-auto max-w-5xl">
        <Link href="/student/dashboard" className="mb-6 inline-flex items-center gap-2 text-sm font-bold text-indigo-700 dark:text-brand">
          <ArrowLeft className="h-4 w-4" />Student dashboard
        </Link>
        <div className="mb-8 flex items-center gap-3">
          <BookOpenText className="h-9 w-9 text-indigo-600 dark:text-brand" />
          <div>
            <h1 className="font-display text-3xl font-black text-slate-900 dark:text-white">My Books</h1>
            <p className="text-slate-600 dark:text-slate-400">Your textbooks, page by page as printed, with a whiteboard beside them to write and work on.</p>
          </div>
        </div>

        {!access.premium ? (
          <PremiumFeatureNotice title="My Books" description={BOOKS_PREMIUM_DESCRIPTION} />
        ) : (
          <BookShelf books={books} hrefBase="/student/smartbook" coverBase="/api/student/smartbook" empty={`No books are ready for ${access.className ?? 'your class'} yet. They appear here as your teachers publish them.`} />
        )}
      </div>
    </main>
  );
}
