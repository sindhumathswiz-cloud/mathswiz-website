import { notFound } from 'next/navigation';
import { requireTeacherPremium, requireTeacherSession } from '@/lib/teacher-guard';
import { loadReaderBook } from '@/lib/book-reader';
import BookReader from '@/components/smartbook/BookReader';

export const dynamic = 'force-dynamic';

/** A teacher reads any active book whole (published or not), with a whiteboard beside it. */
export default async function TeacherBookReaderPage({ params, searchParams }: { params: Promise<{ bookId: string }>; searchParams: Promise<{ page?: string }> }) {
  const locked = await requireTeacherPremium('Books are locked', 'Premium teachers can read every published book with a whiteboard beside it.');
  if (locked) return <div className="min-h-screen bg-slate-50 dark:bg-background p-8">{locked}</div>;
  const session = await requireTeacherSession();
  const { bookId } = await params;
  const book = await loadReaderBook(bookId, { isActive: true });
  if (!book) notFound();
  const asked = Number.parseInt((await searchParams).page ?? '', 10);

  return (
    <BookReader
      bookId={book.id}
      title={book.title}
      subtitle={[book.className, book.author, book.publisher, book.edition].filter(Boolean).join(' · ')}
      backHref="/teacher/smartbook"
      backLabel="Books"
      pages={book.pages}
      chapters={book.chapters}
      pageAspect={book.pageAspect}
      pageImageBase={`/api/teacher/smartbook/${book.id}/pages`}
      storageKey={`book:${(session.user as { id: string }).id}:${book.id}`}
      initialPage={Number.isInteger(asked) ? asked : null}
    />
  );
}
