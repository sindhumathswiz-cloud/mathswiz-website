import ManifestEditorClient from './ManifestEditorClient';

export default async function ChapterManifestPage({ params }: { params: Promise<{ bookId: string }> }) {
  const { bookId } = await params;
  return <ManifestEditorClient bookId={bookId} />;
}
