import SourceBookClient from './SourceBookClient';

export default async function SourceBookPage({ params, searchParams }: { params: Promise<{ bookId: string }>; searchParams: Promise<{ page?: string }> }) {
  const { bookId } = await params;
  const { page } = await searchParams;
  const initialPage = Number.parseInt(page ?? '', 10);
  return <SourceBookClient bookId={bookId} initialPage={Number.isInteger(initialPage) && initialPage > 0 ? initialPage : null} />;
}
