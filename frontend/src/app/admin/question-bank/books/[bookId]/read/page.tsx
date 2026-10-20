import prisma from '@/lib/prisma';
import BookReaderClient from './BookReaderClient';

export const dynamic = 'force-dynamic';

/**
 * The book beside its questions: pages as printed on the left, the questions extracted from them on the
 * right, each editable against the original. ?question=<id> opens at that question; ?page=<n> at a page.
 */
export default async function BookReaderPage({ params, searchParams }: { params: Promise<{ bookId: string }>; searchParams: Promise<{ page?: string; question?: string }> }) {
  const { bookId } = await params;
  const { page, question } = await searchParams;

  let initialPage = Number.parseInt(page ?? '', 10);
  let initialQuestionId: string | null = null;
  if (question) {
    const found = await prisma.question.findFirst({ where: { id: question, bookId }, select: { id: true, sourcePageStart: true } });
    if (found) {
      initialQuestionId = found.id;
      if (found.sourcePageStart) initialPage = found.sourcePageStart;
    }
  }
  return <BookReaderClient bookId={bookId} initialPage={Number.isInteger(initialPage) && initialPage > 0 ? initialPage : null} initialQuestionId={initialQuestionId} />;
}
