import { notFound, redirect } from 'next/navigation';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { PremiumFeatureNotice } from '@/components/PremiumAccess';
import { loadSmartbookExercise, studentSmartbookAccess } from '@/lib/smartbook-data';
import { SMARTBOOK_PREMIUM_DESCRIPTION } from '@/lib/smartbook';
import SmartbookExerciseClient from './SmartbookExerciseClient';

export const dynamic = 'force-dynamic';

export default async function SmartbookExercisePage({ params }: { params: Promise<{ bookId: string; exerciseId: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id || session.user.role !== 'STUDENT') redirect('/login');
  const access = await studentSmartbookAccess(session.user.id);
  if (!access.premium) {
    return <main className="min-h-screen bg-slate-50 p-6 dark:bg-background md:p-10"><div className="mx-auto max-w-4xl"><PremiumFeatureNotice title="Smartbooks" description={SMARTBOOK_PREMIUM_DESCRIPTION} /></div></main>;
  }
  const { bookId, exerciseId } = await params;
  const data = await loadSmartbookExercise(bookId, exerciseId, access.className);
  if (!data) notFound();
  return <SmartbookExerciseClient data={JSON.parse(JSON.stringify(data))} />;
}
