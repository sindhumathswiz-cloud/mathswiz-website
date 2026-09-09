import { redirect } from 'next/navigation';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import HomeworkReviewClient from './HomeworkReviewClient';

export default async function TeacherHomeworkPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id || session.user.role !== 'TEACHER') redirect('/login');
  return <HomeworkReviewClient />;
}
