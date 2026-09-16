import { redirect } from 'next/navigation';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import LearningPathClient from './LearningPathClient';

export default async function StudentLearningPathPage({ params }: { params: Promise<{ topic: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id || session.user.role !== 'STUDENT') redirect('/login');
  const { topic } = await params;
  return <LearningPathClient topicParam={topic} />;
}
