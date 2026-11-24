import { notFound, redirect } from 'next/navigation';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { PremiumFeatureNotice } from '@/components/PremiumAccess';
import { studentSmartbookAccess } from '@/lib/smartbook-data';
import { loadReaderBook, studentBooksWhere } from '@/lib/book-reader';
import BookReader from '@/components/smartbook/BookReader';

export const dynamic = 'force-dynamic';

export default async function StudentBookReaderPage({ params, searchParams }: { params: Promise<{ bookId: string }>; searchParams: Promise<{ page?: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id || session.user.role !== 'STUDENT') redirect('/login');
  const access = await studentSmartbookAccess(session.user.id);
  if (!access.premium) {
    return <main className="min-h-screen bg-slate-50 p-6 dark:bg-background md:p-10"><div className="mx-auto max-w-4xl"><PremiumFeatureNotice title="My Books" description="Read your textbooks page by page, exactly as printed, with a whiteboard beside them to work on." /></div></main>;
  }
  const { bookId } = await params;
  const book = await loadReaderBook(bookId, studentBooksWhere(access.className));
  if (!book) notFound();
  const asked = Number.parseInt((await searchParams).page ?? '', 10);

  return (
    <BookReader
      bookId={book.id}
      title={book.title}
      subtitle={[book.className, book.author, book.publisher, book.edition].filter(Boolean).join(' · ')}
      backHref="/student/smartbook"
      backLabel="My Books"
      pages={book.pages}
      chapters={book.chapters}
      pageAspect={book.pageAspect}
      pageImageBase={`/api/student/smartbook/${book.id}/pages`}
      storageKey={`book:${session.user.id}:${book.id}`}
      initialPage={Number.isInteger(asked) ? asked : null}
    />
  );
}
