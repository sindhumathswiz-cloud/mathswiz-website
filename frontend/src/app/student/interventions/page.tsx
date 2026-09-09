import { redirect } from 'next/navigation';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import StudentInterventionsClient from './StudentInterventionsClient';
export default async function Page() { const session = await getServerSession(authOptions); if (!session?.user?.id || session.user.role !== 'STUDENT') redirect('/login'); return <StudentInterventionsClient />; }
