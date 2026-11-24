import { requireTeacherPremium } from '@/lib/teacher-guard';
import { loadQuestionSources } from '@/lib/question-sources';
import { loadReaderShelf, teacherBooksWhere } from '@/lib/book-reader';
import BookShelf from '@/components/smartbook/BookShelf';
import TeacherSmartbookClient from './TeacherSmartbookClient';

export const dynamic = 'force-dynamic';

export default async function TeacherSmartbookPage() {
  const locked = await requireTeacherPremium('Books are locked', 'Premium teachers can read every published book with a whiteboard beside it, and set any exercise of a book as a test or homework in one step.');
  if (locked) return <div className="min-h-screen bg-slate-50 dark:bg-background p-8">{locked}</div>;
  const [shelf, books] = await Promise.all([loadReaderShelf(teacherBooksWhere), loadQuestionSources()]);
  return (
    <>
      <section aria-labelledby="books-heading" className="bg-slate-50 px-6 pt-6 dark:bg-background md:px-10 md:pt-10">
        <div className="mx-auto max-w-5xl">
          <h1 id="books-heading" className="font-display text-3xl font-black text-slate-900 dark:text-white">Books</h1>
          <p className="mb-6 text-slate-600 dark:text-slate-400">Every published book, page by page as printed, with a whiteboard beside it.</p>
          <BookShelf books={shelf} hrefBase="/teacher/smartbook" coverBase="/api/teacher/smartbook" empty="No book is published yet. Publish one from the admin book catalogue." />
        </div>
      </section>
      <TeacherSmartbookClient books={books} />
    </>
  );
}
