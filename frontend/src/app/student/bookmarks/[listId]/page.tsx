import { redirect } from 'next/navigation';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import BookmarkListClient from './BookmarkListClient';

export default async function StudentBookmarkListPage({ params }: { params: Promise<{ listId: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id || session.user.role !== 'STUDENT') redirect('/login');
  const { listId } = await params;
  return <BookmarkListClient listId={listId} />;
}
