import { redirect } from 'next/navigation';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import Leaderboard from '@/components/Leaderboard';
import { Trophy } from 'lucide-react';

export default async function StudentLeaderboardPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id || session.user.role !== 'STUDENT') redirect('/login');

  return (
    <main className="min-h-screen bg-slate-50 dark:bg-background p-6 md:p-10">
      <div className="mx-auto max-w-2xl">
        <div className="mb-8 flex items-center gap-3">
          <Trophy className="w-9 h-9 text-indigo-600 dark:text-brand" />
          <div>
            <h1 className="font-display text-3xl font-black text-slate-900 dark:text-white">Batch Leaderboard</h1>
            <p className="text-slate-500 dark:text-slate-400 font-medium text-sm">Rewards accuracy, improvement, consistency, and effort — not just raw marks.</p>
          </div>
        </div>
        <Leaderboard />
      </div>
    </main>
  );
}
