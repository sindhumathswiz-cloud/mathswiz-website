import { redirect } from 'next/navigation';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { isPremiumSubscription } from '@/lib/subscription';
import { PremiumFeatureNotice } from '@/components/PremiumAccess';

export async function requireTeacherSession() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id || (session.user as any).role !== 'TEACHER') redirect('/login');
  return session;
}

/**
 * Standalone teacher routes (e.g. /teacher/question-bank) duplicate a
 * premium-gated dashboard tab, but weren't themselves checking subscription
 * tier -- a free teacher could reach the full feature by typing the URL
 * directly instead of clicking the locked sidebar/tab entry. Returns a lock
 * screen to render in place of the page when the teacher isn't premium, or
 * null when the page should render normally.
 */
export async function requireTeacherPremium(title: string, description: string) {
  const session = await requireTeacherSession();
  const teacher = await prisma.user.findUnique({ where: { id: (session.user as any).id }, select: { subscription: true } });
  if (!isPremiumSubscription(teacher?.subscription)) {
    return <PremiumFeatureNotice title={title} description={description} />;
  }
  return null;
}
