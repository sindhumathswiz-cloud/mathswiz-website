import { notFound, redirect } from 'next/navigation';
import { getServerSession } from 'next-auth';
import prisma from '@/lib/prisma';
import { authOptions } from '@/lib/auth';
import { isPremiumSubscription } from '@/lib/subscription';
import { PremiumFeatureNotice } from '@/components/PremiumAccess';
import { loadRevisionSheet } from '@/lib/student-revision';
import RevisionSheetClient from './RevisionSheetClient';

export const dynamic = 'force-dynamic';

export default async function StudentRevisionSheetPage({ params }: { params: Promise<{ chapterId: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id || session.user.role !== 'STUDENT') redirect('/login');
  const { chapterId } = await params;

  const student = await prisma.user.findUnique({ where: { id: session.user.id }, select: { subscription: true, class: true } });
  if (!isPremiumSubscription(student?.subscription)) {
    return (
      <main className="min-h-screen bg-slate-50 p-6 dark:bg-background md:p-10">
        <div className="mx-auto max-w-4xl">
          <PremiumFeatureNotice title="Chapter revision sheets" description="Definitions, theorem statements and formula sheets for every chapter, with flashcards to practise them before a chapter test." />
        </div>
      </main>
    );
  }

  const sheet = await loadRevisionSheet(chapterId, session.user.id, student?.class);
  if (!sheet) notFound();
  return <RevisionSheetClient sheet={sheet} />;
}
