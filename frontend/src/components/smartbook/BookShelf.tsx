import Link from 'next/link';
import type { ReaderBookSummary } from '@/lib/book-reader';

/** A shelf of books to open in the reader, each shown by its first page. */
export default function BookShelf({ books, hrefBase, coverBase, empty }: {
  books: ReaderBookSummary[];
  /** Each book opens at `${hrefBase}/${book.id}`. */
  hrefBase: string;
  /** A book's page images are at `${coverBase}/${book.id}/pages/${page}`. */
  coverBase: string;
  empty: string;
}) {
  if (books.length === 0) {
    return <p data-testid="books-empty" className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center text-slate-500 dark:border-white/10 dark:bg-surface">{empty}</p>;
  }
  return (
    <ul className="grid grid-cols-2 gap-5 sm:grid-cols-3 lg:grid-cols-4">
      {books.map((book) => (
        <li key={book.id}>
          <Link href={`${hrefBase}/${book.id}`} data-testid={`book-${book.id}`} className="group flex h-full flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white hover:border-indigo-300 hover:shadow-md dark:border-white/10 dark:bg-surface dark:hover:border-brand/40">
            <div className="aspect-[3/4] overflow-hidden border-b border-slate-100 bg-slate-100 dark:border-white/10 dark:bg-white/5">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={`${coverBase}/${book.id}/pages/${book.firstPage}`} alt="" loading="lazy" className="h-full w-full object-cover object-top transition-transform group-hover:scale-[1.02]" />
            </div>
            <div className="flex flex-1 flex-col gap-1 p-3.5">
              <p className="font-black leading-snug text-slate-900 dark:text-white">{book.title}</p>
              <p className="text-xs text-slate-500">{[book.className, book.publisher, book.edition].filter(Boolean).join(' · ')}</p>
              <p className="mt-auto pt-2 text-xs font-bold tabular-nums text-indigo-700 dark:text-brand">
                {book.pageCount} pages{book.chapterCount ? ` · ${book.chapterCount} chapters` : ''}
              </p>
            </div>
          </Link>
        </li>
      ))}
    </ul>
  );
}
