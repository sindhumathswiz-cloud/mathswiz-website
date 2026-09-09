import { redirect } from 'next/navigation';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import TeacherMasteryClient from './TeacherMasteryClient';

export default async function TeacherMasteryPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id || session.user.role !== 'TEACHER') redirect('/login');
  return <TeacherMasteryClient />;
}
