import { redirect } from 'next/navigation';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import LearningPathsClient from './LearningPathsClient';

export default async function StudentLearningPathsPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id || session.user.role !== 'STUDENT') redirect('/login');
  return <LearningPathsClient />;
}
