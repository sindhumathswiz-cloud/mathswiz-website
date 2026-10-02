import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { isPremiumSubscription } from '@/lib/subscription';

type GuardOk = { ok: true; userId: string; role: string };
type GuardFail = { ok: false; response: NextResponse };
export type GuardResult = GuardOk | GuardFail;

/**
 * Many /api/teacher/** routes only checked "is there a session" and relied
 * on ownership filters (teacherId: userId) to keep non-teachers from seeing
 * anything -- but several sibling routes let a non-teacher become the
 * "owner" of a batch/test/etc in the first place, which turns every one of
 * those ownership-only checks into a real bypass. This is the explicit
 * role gate those routes were missing.
 */
export function requireTeacherOrAdmin(session: any): GuardResult {
  const userId = session?.user?.id;
  const role = session?.user?.role;
  if (!userId || !role) {
    return { ok: false, response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  }
  if (role !== 'TEACHER' && role !== 'ADMIN') {
    return { ok: false, response: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) };
  }
  return { ok: true, userId, role };
}

/**
 * Same as requireTeacherOrAdmin, but additionally requires PREMIUM for a
 * TEACHER caller -- the dashboard UI already hides these features behind a
 * "Premium" lock for free teachers, but nothing stopped a free teacher from
 * calling the API directly. ADMIN is exempt (admins aren't subscribers).
 */
export async function requirePremiumTeacher(session: any): Promise<GuardResult> {
  const base = requireTeacherOrAdmin(session);
  if (!base.ok) return base;
  if (base.role === 'ADMIN') return base;
  const user = await prisma.user.findUnique({ where: { id: base.userId }, select: { subscription: true } });
  if (!isPremiumSubscription(user?.subscription)) {
    return { ok: false, response: NextResponse.json({ error: 'This feature requires a premium subscription.' }, { status: 403 }) };
  }
  return base;
}

/**
 * Several /api/teacher/** insight routes (mastery, heatmap, homework) are
 * intentionally TEACHER-only with no ADMIN bypass. Same premium check as
 * requirePremiumTeacher, just without the ADMIN exemption.
 */
export async function requirePremiumTeacherStrict(session: any): Promise<GuardResult> {
  const userId = session?.user?.id;
  const role = session?.user?.role;
  if (!userId || role !== 'TEACHER') {
    return { ok: false, response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  }
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { subscription: true } });
  if (!isPremiumSubscription(user?.subscription)) {
    return { ok: false, response: NextResponse.json({ error: 'This feature requires a premium subscription.' }, { status: 403 }) };
  }
  return { ok: true, userId, role };
}

/**
 * Same checks as requirePremiumTeacher, but throws instead of returning a
 * NextResponse -- for "use server" actions, which propagate errors to the
 * client via thrown Error rather than an HTTP response object.
 */
export async function requirePremiumTeacherOrThrow(): Promise<{ userId: string; role: string }> {
  const { getServerSession } = await import('next-auth');
  const { authOptions } = await import('@/lib/auth');
  const session = await getServerSession(authOptions);
  const userId = session?.user?.id as string | undefined;
  const role = (session?.user as any)?.role as string | undefined;
  if (!userId || (role !== 'TEACHER' && role !== 'ADMIN')) throw new Error('Unauthorized');
  if (role === 'ADMIN') return { userId, role };
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { subscription: true } });
  if (!isPremiumSubscription(user?.subscription)) throw new Error('This feature requires a premium subscription.');
  return { userId, role };
}
