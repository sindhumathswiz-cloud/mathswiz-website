import { redirect } from 'next/navigation';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import FlashcardsClient from './FlashcardsClient';

export default async function StudentFlashcardsPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id || session.user.role !== 'STUDENT') redirect('/login');
  return <FlashcardsClient />;
}
