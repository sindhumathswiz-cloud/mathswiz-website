import FiguresReviewClient from './FiguresReviewClient';

export default async function BookFiguresPage({ params }: { params: Promise<{ bookId: string }> }) {
  const { bookId } = await params;
  return <FiguresReviewClient bookId={bookId} />;
}
