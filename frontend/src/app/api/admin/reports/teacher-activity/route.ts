import { NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/auth-server';
import prisma from '@/lib/prisma';

export const dynamic = 'force-dynamic';

const DEFAULT_WINDOW_DAYS = 30;
const MAX_WINDOW_DAYS = 90;

/**
 * First-ever read against AuditLog in this codebase -- it's written at
 * ~60 call sites via recordAuditLog() but nothing had ever queried it back.
 * Uses the already-existing [actorId, createdAt] index. Capped window since
 * AuditLog has no retention/archival policy and could grow large.
 */
export async function GET(req: Request) {
  const auth = await getAuthenticatedUser(['ADMIN']);
  if ('error' in auth) return auth.error;

  const requestedDays = Number(new URL(req.url).searchParams.get('days'));
  const windowDays = Number.isFinite(requestedDays) && requestedDays > 0
    ? Math.min(requestedDays, MAX_WINDOW_DAYS)
    : DEFAULT_WINDOW_DAYS;
  const windowStart = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000);

  const grouped = await prisma.auditLog.groupBy({
    by: ['actorId', 'action'],
    where: { actorRole: 'TEACHER', createdAt: { gte: windowStart } },
    _count: { _all: true },
  });

  const actorIds = [...new Set(grouped.map((g) => g.actorId).filter((id): id is string => !!id))];
  const teachers = actorIds.length > 0
    ? await prisma.user.findMany({ where: { id: { in: actorIds } }, select: { id: true, firstName: true, lastName: true } })
    : [];
  const teacherById = new Map(teachers.map((t) => [t.id, t]));

  const byActor = new Map<string, { actionCounts: Record<string, number>; total: number }>();
  for (const g of grouped) {
    if (!g.actorId) continue;
    const entry = byActor.get(g.actorId) ?? { actionCounts: {}, total: 0 };
    entry.actionCounts[g.action] = g._count._all;
    entry.total += g._count._all;
    byActor.set(g.actorId, entry);
  }

  const teacherActivity = [...byActor.entries()]
    .map(([actorId, entry]) => {
      const teacher = teacherById.get(actorId);
      return {
        teacherId: actorId,
        teacherName: teacher ? `${teacher.firstName || ''} ${teacher.lastName || ''}`.trim() || teacher.id : 'Unknown teacher',
        totalActions: entry.total,
        actionCounts: entry.actionCounts,
      };
    })
    .sort((a, b) => b.totalActions - a.totalActions);

  return NextResponse.json({ teacherActivity, windowDays });
}
