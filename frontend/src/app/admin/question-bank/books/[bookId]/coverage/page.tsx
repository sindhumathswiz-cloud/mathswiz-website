import CoverageClient from './CoverageClient';

export const dynamic = 'force-dynamic';

export default async function BookCoveragePage({ params }: { params: Promise<{ bookId: string }> }) {
  const { bookId } = await params;
  return <CoverageClient bookId={bookId} />;
}
