import RevisionReviewClient from './RevisionReviewClient';

export default async function RevisionContentPage({ params }: { params: Promise<{ bookId: string }> }) {
  const { bookId } = await params;
  return <RevisionReviewClient bookId={bookId} />;
}
