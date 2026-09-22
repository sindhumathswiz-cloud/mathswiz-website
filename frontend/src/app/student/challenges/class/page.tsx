import { redirect } from 'next/navigation';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import ClassChallenge from '@/components/ClassChallenge';
import { Swords } from 'lucide-react';

export default async function ClassChallengePage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id || session.user.role !== 'STUDENT') redirect('/login');

  return (
    <main className="min-h-screen bg-slate-50 p-6 md:p-10">
      <div className="mx-auto max-w-2xl">
        <div className="mb-8 flex items-center gap-3">
          <Swords className="w-9 h-9 text-indigo-600" />
          <div>
            <h1 className="text-3xl font-black text-slate-900">Class Challenge</h1>
            <p className="text-slate-500 font-medium text-sm">A time-boxed, teacher-run challenge for your batch.</p>
          </div>
        </div>
        <ClassChallenge />
      </div>
    </main>
  );
}
