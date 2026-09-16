import { redirect } from 'next/navigation';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import FlashcardStudyClient from './FlashcardStudyClient';

export default async function StudentFlashcardStudyPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id || session.user.role !== 'STUDENT') redirect('/login');
  return <FlashcardStudyClient />;
}
