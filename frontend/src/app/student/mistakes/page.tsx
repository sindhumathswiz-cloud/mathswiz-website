import { redirect } from 'next/navigation';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import MistakesNotebookClient from './MistakesNotebookClient';

export default async function StudentMistakesPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id || session.user.role !== 'STUDENT') redirect('/login');
  return <MistakesNotebookClient />;
}
