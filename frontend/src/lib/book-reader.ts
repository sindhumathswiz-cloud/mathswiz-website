/**
 * Books as a reader: a published book is read whole, page by page, as its PDF was printed, beside a whiteboard.
 * No questions need to be extracted first; what a book needs is its rendered pages and, for the chapter list, each
 * chapter's first page (from the book's manifest).
 *
 * Who reads what: a Premium student reads the published, active books of their own class; a teacher reads every
 * published, active book. Page images are only ever sent through the routes that check this (never by path).
 */
import type { Prisma } from '@prisma/client';
import prisma from './prisma';
import { readerChapters, type ReaderChapter } from './book-reader-chapters';

export { chapterAt, readerChapters, type ReaderChapter } from './book-reader-chapters';

export interface ReaderBookSummary {
  id: string;
  title: string;
  author: string | null;
  publisher: string | null;
  edition: string | null;
  className: string;
  pageCount: number;
  chapterCount: number;
  /** The first page, shown as the book's cover. */
  firstPage: number;
}

export interface ReaderBook extends ReaderBookSummary {
  /** The book's pages that have an image, in order (PDF page numbers). */
  pages: number[];
  chapters: ReaderChapter[];
  /** Height over width of the book's pages, from the first page whose size is recorded. */
  pageAspect: number | null;
}

export const studentBooksWhere = (className: string | null): Prisma.BookWhereInput => ({
  smartbookPublishedAt: { not: null }, isActive: true, className: className ?? '__no_class__',
});
export const teacherBooksWhere: Prisma.BookWhereInput = { smartbookPublishedAt: { not: null }, isActive: true };

const bookSelect = {
  id: true, title: true, author: true, publisher: true, edition: true, className: true,
  ingestionRuns: { orderBy: { createdAt: 'desc' as const }, take: 1, select: { sourceDocumentId: true } },
} satisfies Prisma.BookSelect;

const withImage: Prisma.DocumentPageWhereInput = { OR: [{ pageImagePath: { not: null } }, { processedImagePath: { not: null } }] };

/** The rendered PDF behind a book: its latest ingestion's document, else the newest document filed under the book. */
async function documentOf(book: { id: string; ingestionRuns: Array<{ sourceDocumentId: string | null }> }): Promise<string | null> {
  const fromRun = book.ingestionRuns[0]?.sourceDocumentId;
  if (fromRun) return fromRun;
  const doc = await prisma.sourceDocument.findFirst({ where: { bookId: book.id }, orderBy: { ingestedAt: 'desc' }, select: { id: true } });
  return doc?.id ?? null;
}

/** The books on a reader's shelf, each with how many pages and chapters it has. Books with no pages yet are left out. */
export async function loadReaderShelf(where: Prisma.BookWhereInput): Promise<ReaderBookSummary[]> {
  const books = await prisma.book.findMany({ where, select: { ...bookSelect, chapters: { select: { id: true, name: true, chapterNumber: true, startPage: true } } }, orderBy: [{ className: 'asc' }, { title: 'asc' }] });
  const shelf = await Promise.all(books.map(async (book) => {
    const documentId = await documentOf(book);
    if (!documentId) return null;
    const pages = (await prisma.documentPage.findMany({ where: { documentId, ...withImage }, select: { pageNumber: true }, orderBy: { pageNumber: 'asc' } })).map((p) => p.pageNumber);
    if (!pages.length) return null;
    return {
      id: book.id, title: book.title, author: book.author, publisher: book.publisher, edition: book.edition, className: book.className,
      pageCount: pages.length,
      chapterCount: readerChapters(book.chapters, pages).length,
      firstPage: pages[0],
    };
  }));
  return shelf.filter((b): b is ReaderBookSummary => b != null);
}

/** One book to read, or null when it isn't one this reader may open. */
export async function loadReaderBook(bookId: string, where: Prisma.BookWhereInput): Promise<ReaderBook | null> {
  const book = await prisma.book.findFirst({ where: { id: bookId, ...where }, select: { ...bookSelect, chapters: { select: { id: true, name: true, chapterNumber: true, startPage: true } } } });
  if (!book) return null;
  const documentId = await documentOf(book);
  if (!documentId) return null;
  const pages = (await prisma.documentPage.findMany({ where: { documentId, ...withImage }, select: { pageNumber: true }, orderBy: { pageNumber: 'asc' } })).map((p) => p.pageNumber);
  if (!pages.length) return null;
  const chapters = readerChapters(book.chapters, pages);
  const sized = await prisma.documentPage.findFirst({ where: { documentId, width: { gt: 0 }, height: { gt: 0 }, ...withImage }, orderBy: { pageNumber: 'asc' }, select: { width: true, height: true } });
  return {
    id: book.id, title: book.title, author: book.author, publisher: book.publisher, edition: book.edition, className: book.className,
    pageCount: pages.length, chapterCount: chapters.length, firstPage: pages[0], pages, chapters,
    pageAspect: sized?.width && sized.height ? sized.height / sized.width : null,
  };
}

/** The stored image of any page of a book this reader may open. */
export async function readerPageImagePath(bookId: string, pageNumber: number, where: Prisma.BookWhereInput): Promise<string | null> {
  const book = await prisma.book.findFirst({ where: { id: bookId, ...where }, select: { id: true, ingestionRuns: bookSelect.ingestionRuns } });
  if (!book) return null;
  const documentId = await documentOf(book);
  if (!documentId) return null;
  const page = await prisma.documentPage.findFirst({ where: { documentId, pageNumber }, select: { processedImagePath: true, pageImagePath: true } });
  return page?.processedImagePath || page?.pageImagePath || null;
}
